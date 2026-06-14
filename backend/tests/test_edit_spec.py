"""Tests for the recording edit-spec codec, validation and ffmpeg filtergraph."""

import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from app.services.edit_spec import EditSpec
from app.services.edit_spec import EditSpecError
from app.services.edit_spec import SilenceSegment
from app.services.edit_spec import SourceSegment
from app.services.edit_spec import build_filtergraph
from app.services.edit_spec import decode
from app.services.edit_spec import encode
from app.services.edit_spec import validate

ffmpeg_required = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def _sample_spec() -> EditSpec:
    return EditSpec(
        recording_id=42,
        segments=[
            SourceSegment(source_start=0.0, source_end=5.0, gain=1.0, fade_in=0.5),
            SourceSegment(source_start=4.0, source_end=10.0, gain=0.5, crossfade_prev=1.5),
            SilenceSegment(length=2.0),
            SourceSegment(source_start=10.0, source_end=14.0, gain=1.0, fade_out=0.5),
        ],
    )


def test_round_trip_preserves_spec():
    spec = _sample_spec()
    decoded = decode(encode(spec))
    assert decoded.to_array() == spec.to_array()
    assert decoded.recording_id == 42
    assert isinstance(decoded.segments[2], SilenceSegment)


def test_decode_rejects_garbage():
    with pytest.raises(EditSpecError):
        decode("!!!not-base64!!!")


def test_decode_rejects_non_array_json():
    # base64url of the JSON string "hello"
    with pytest.raises(EditSpecError):
        decode(encode_raw('"hello"'))


def test_decode_rejects_unknown_version():
    with pytest.raises(EditSpecError):
        decode(encode_raw("[99,1,[]]"))


def test_decode_rejects_bad_segment_shape():
    with pytest.raises(EditSpecError):
        decode(encode_raw("[1,1,[[0,1.0]]]"))  # source segment missing fields


def test_decode_rejects_non_finite():
    with pytest.raises(EditSpecError):
        decode(encode_raw("[1,1,[[0,0,5,1,Infinity,0,0]]]"))


def encode_raw(json_text: str) -> str:
    return base64.urlsafe_b64encode(json_text.encode()).decode().rstrip("=")


def test_validate_rejects_out_of_range():
    spec = EditSpec(recording_id=1, segments=[SourceSegment(source_start=0.0, source_end=20.0)])
    with pytest.raises(EditSpecError):
        validate(spec, recording_duration=10.0)


def test_validate_rejects_inverted_range():
    spec = EditSpec(recording_id=1, segments=[SourceSegment(source_start=5.0, source_end=5.0)])
    with pytest.raises(EditSpecError):
        validate(spec, recording_duration=10.0)


def test_validate_rejects_excess_gain():
    spec = EditSpec(recording_id=1, segments=[SourceSegment(source_start=0.0, source_end=5.0, gain=5.0)])
    with pytest.raises(EditSpecError):
        validate(spec, recording_duration=10.0)


def test_validate_accepts_valid_spec():
    validate(_sample_spec(), recording_duration=30.0)


def test_total_output_subtracts_crossfade():
    spec = _sample_spec()
    # 5 + 6 + 2 + 4 = 17, minus a single 1.5s crossfade = 15.5
    assert spec.total_output_seconds() == pytest.approx(15.5)


def test_build_filtergraph_structure():
    fc, out = build_filtergraph(_sample_spec())
    assert "atrim=0.000:5.000" in fc
    assert "volume=0.500" in fc
    assert "anullsrc=channel_layout=stereo" in fc
    assert "acrossfade=d=1.500:c1=qsin:c2=qsin" in fc
    assert "concat=n=2:v=0:a=1" in fc
    assert out.startswith("[a")


@ffmpeg_required
def test_render_end_to_end_duration():
    spec = _sample_spec()
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "sine.mp3"
        out = Path(tmp) / "clip.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
             "-ac", "2", "-ar", "44100", str(source)],
            check=True, capture_output=True,
        )
        fc, out_label = build_filtergraph(spec)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(source), "-filter_complex", fc,
             "-map", out_label, "-f", "mp3", "-c:a", "libmp3lame", "-q:a", "2", str(out)],
            check=True, capture_output=True,
        )
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(out)],
            check=True, capture_output=True,
        )
        duration = float(probe.stdout.decode().strip())
        assert 14.5 <= duration <= 16.5  # ~15.5s expected, MP3 framing tolerance
