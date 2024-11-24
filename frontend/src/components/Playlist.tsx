import React, { useEffect, useState } from "react";
import { List, ListItem, ListItemText, Typography } from "@mui/material";
import { ApiClient, Song } from "../api";

const api = new ApiClient();

const Playlist: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    const fetchSongs = async () => {
      const response = await api.apiPublicList();
      setSongs(response);
    };
    fetchSongs();
  }, []);

  return (
    <div>
      <Typography variant="h6">Upcoming Songs</Typography>
      <List>
        {songs.map((song, index) => (
          <ListItem key={index}>
            <ListItemText primary={song.title || song.url} />
          </ListItem>
        ))}
      </List>
    </div>
  );
};

export default Playlist;
