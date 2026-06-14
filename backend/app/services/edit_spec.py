"""Decode, validate and render recording edits described entirely by a URL blob.

An edit is an ordered list of segments cut from a single recording: ``SourceSegment`` slices the
recording (with per-segment gain, fade in/out and an equal-power crossfade with the previous
segment) and ``SilenceSegment`` inserts a gap. The whole edit is encoded as base64url of a compact
positional-array JSON so the same blob drives both the editor URL and the public render URL:

    [version, recordingId, segments]
      source  segment : [0, start, end, gain, fadeIn, fadeOut, crossfadePrev]
      silence segment : [1, duration, fadeIn, fadeOut]

The render is a pure function of (recording, blob); nothing is persisted. ``build_filtergraph``
emits a single ffmpeg ``filter_complex`` (atrim/asetpts + volume + afade + acrossfade/concat,
normalised to a common format) that the render service streams on the fly.
"""

import base64
import binascii
import json
from dataclasses import dataclass
from dataclasses import field

from app.settings import settings

CURRENT_VERSION = 1

_RENDER_SAMPLE_RATE = 44100
_CHANNEL_LAYOUT = "stereo"
_MAX_GAIN = 2.0


class EditSpecError(ValueError):
    """Raised when a blob is malformed or violates limits (maps to HTTP 400)."""


@dataclass
class SourceSegment:
    """A slice of the base recording with gain, fades and crossfade-with-previous."""

    source_start: float
    source_end: float
    gain: float = 1.0
    fade_in: float = 0.0
    fade_out: float = 0.0
    crossfade_prev: float = 0.0

    @property
    def duration(self) -> float:
        return self.source_end - self.source_start

    def to_array(self) -> list[float]:
        return [
            0,
            round(self.source_start, 3),
            round(self.source_end, 3),
            round(self.gain, 3),
            round(self.fade_in, 3),
            round(self.fade_out, 3),
            round(self.crossfade_prev, 3),
        ]


@dataclass
class SilenceSegment:
    """An inserted gap of silence."""

    length: float
    fade_in: float = 0.0
    fade_out: float = 0.0

    @property
    def duration(self) -> float:
        return self.length

    def to_array(self) -> list[float]:
        return [1, round(self.length, 3), round(self.fade_in, 3), round(self.fade_out, 3)]


Segment = SourceSegment | SilenceSegment


@dataclass
class EditSpec:
    """A full edit: an ordered list of segments cut from one recording."""

    recording_id: int
    segments: list[Segment] = field(default_factory=list)
    version: int = CURRENT_VERSION

    def total_output_seconds(self) -> float:
        """Estimated rendered duration, accounting for crossfade overlap consumption."""
        total = sum(seg.duration for seg in self.segments)
        for i in range(1, len(self.segments)):
            seg = self.segments[i]
            if isinstance(seg, SourceSegment) and seg.crossfade_prev > 0:
                total -= min(seg.crossfade_prev, self.segments[i - 1].duration, seg.duration)
        return total

    def to_array(self) -> list:
        return [self.version, self.recording_id, [seg.to_array() for seg in self.segments]]


def encode(spec: EditSpec) -> str:
    """Encode an EditSpec to a URL-safe blob (base64url of compact positional-array JSON)."""
    raw = json.dumps(spec.to_array(), separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _as_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EditSpecError("expected a number")
    return float(value)


def _reject_nonfinite(token: str) -> float:
    raise EditSpecError(f"non-finite number not allowed: {token}")


def _parse_segment(item: object) -> Segment:
    if not isinstance(item, list) or not item:
        raise EditSpecError("segment must be a non-empty array")
    tag = item[0]
    if tag == 0:
        if len(item) != 7:
            raise EditSpecError("source segment must have 7 fields")
        return SourceSegment(
            source_start=_as_number(item[1]),
            source_end=_as_number(item[2]),
            gain=_as_number(item[3]),
            fade_in=_as_number(item[4]),
            fade_out=_as_number(item[5]),
            crossfade_prev=_as_number(item[6]),
        )
    if tag == 1:
        if len(item) != 4:
            raise EditSpecError("silence segment must have 4 fields")
        return SilenceSegment(
            length=_as_number(item[1]),
            fade_in=_as_number(item[2]),
            fade_out=_as_number(item[3]),
        )
    raise EditSpecError(f"unknown segment tag {tag!r}")


def decode(blob: str) -> EditSpec:
    """Decode a URL blob into an EditSpec.

    Raises EditSpecError on any malformed input.
    """
    if len(blob) > settings.EDIT_MAX_BLOB_CHARS:
        raise EditSpecError("edit blob too large")
    padded = blob + "=" * (-len(blob) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded)
    except (binascii.Error, ValueError):
        raise EditSpecError("blob is not valid base64url")
    try:
        data = json.loads(raw, parse_constant=_reject_nonfinite)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise EditSpecError("blob does not contain valid JSON")

    if not isinstance(data, list) or len(data) != 3:
        raise EditSpecError("edit must be [version, recordingId, segments]")
    version, recording_id, segments = data
    if version != CURRENT_VERSION:
        raise EditSpecError(f"unsupported edit version {version!r}")
    if isinstance(recording_id, bool) or not isinstance(recording_id, int):
        raise EditSpecError("recordingId must be an integer")
    if not isinstance(segments, list):
        raise EditSpecError("segments must be an array")

    return EditSpec(
        recording_id=recording_id,
        segments=[_parse_segment(item) for item in segments],
        version=version,
    )


def validate(spec: EditSpec, recording_duration: float) -> None:
    """Validate a decoded edit against its recording and configured limits.

    Out-of-range segments fail (no clamping). Crossfade lengths are clamped at render time, so only their sign is
    validated here.
    """
    if not spec.segments:
        raise EditSpecError("edit has no segments")
    if len(spec.segments) > settings.EDIT_MAX_SEGMENTS:
        raise EditSpecError(f"edit exceeds {settings.EDIT_MAX_SEGMENTS} segments")

    for seg in spec.segments:
        if seg.fade_in < 0 or seg.fade_out < 0:
            raise EditSpecError("fades must be non-negative")
        if isinstance(seg, SourceSegment):
            if not (0 <= seg.source_start < seg.source_end <= recording_duration):
                raise EditSpecError("segment range is outside the recording")
            if not (0 <= seg.gain <= _MAX_GAIN):
                raise EditSpecError(f"gain must be between 0 and {_MAX_GAIN}")
            if seg.crossfade_prev < 0:
                raise EditSpecError("crossfade must be non-negative")
        else:
            if seg.length <= 0:
                raise EditSpecError("silence duration must be positive")

    if spec.total_output_seconds() > settings.EDIT_MAX_OUTPUT_SECONDS:
        raise EditSpecError(f"rendered duration exceeds {settings.EDIT_MAX_OUTPUT_SECONDS}s")


def _fmt(value: float) -> str:
    return f"{value:.3f}"


def _segment_chain(index: int, seg: Segment) -> str:
    """Build the filter chain that produces a single normalised segment stream ``[s{index}]``."""
    steps: list[str]
    if isinstance(seg, SourceSegment):
        steps = [
            f"[0:a]atrim={_fmt(seg.source_start)}:{_fmt(seg.source_end)}",
            "asetpts=PTS-STARTPTS",
            f"volume={_fmt(seg.gain)}",
        ]
    else:
        steps = [
            f"anullsrc=channel_layout={_CHANNEL_LAYOUT}:sample_rate={_RENDER_SAMPLE_RATE}",
            f"atrim=duration={_fmt(seg.length)}",
            "asetpts=PTS-STARTPTS",
        ]
    if seg.fade_in > 0:
        steps.append(f"afade=t=in:st=0:d={_fmt(seg.fade_in)}")
    if seg.fade_out > 0:
        start = max(seg.duration - seg.fade_out, 0.0)
        steps.append(f"afade=t=out:st={_fmt(start)}:d={_fmt(seg.fade_out)}")
    steps.append(f"aformat=sample_rates={_RENDER_SAMPLE_RATE}:channel_layouts={_CHANNEL_LAYOUT}")
    return ",".join(steps) + f"[s{index}]"


def build_filtergraph(spec: EditSpec) -> tuple[str, str]:
    """Return ``(filter_complex, out_label)`` for a validated edit.

    Adjacent segments are joined with an equal-power ``acrossfade`` when the later segment requests
    one (clamped to the shorter neighbour so ffmpeg never errors), otherwise a sample-accurate
    ``concat``.
    """
    chains = [_segment_chain(i, seg) for i, seg in enumerate(spec.segments)]
    cur = "[s0]"
    for i in range(1, len(spec.segments)):
        seg = spec.segments[i]
        prev = spec.segments[i - 1]
        out = f"[a{i}]"
        crossfade = seg.crossfade_prev if isinstance(seg, SourceSegment) else 0.0
        crossfade = min(crossfade, prev.duration, seg.duration)
        if crossfade > 0:
            chains.append(f"{cur}[s{i}]acrossfade=d={_fmt(crossfade)}:c1=qsin:c2=qsin{out}")
        else:
            chains.append(f"{cur}[s{i}]concat=n=2:v=0:a=1{out}")
        cur = out
    return ";".join(chains), cur
