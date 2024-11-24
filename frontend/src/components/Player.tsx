import React from "react";

const ICECAST_URL = process.env.REACT_APP_ICECAST_URL || "/cast";

const Player: React.FC = () => (
  <audio controls autoPlay style={{ width: "100%" }}>
    <source src={ICECAST_URL} type="audio/mpeg" />
    Your browser does not support the audio element.
  </audio>
);

export default Player;
