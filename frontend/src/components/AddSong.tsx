import React, { useState } from "react";
import { Button, TextField, Typography, Stack } from "@mui/material";
import { ApiClient } from "../api";

const api = new ApiClient();

const AddSong: React.FC = () => {
  const [url, setUrl] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async () => {
    try {
      if (url) {
        await api.apiPublicAdd({ body: { url } });
      } else if (file) {
        const formData = new FormData();
        formData.append("file", file);
        await api.apiPublicAdd({ body: formData });
      }
      alert("Song added successfully!");
      setUrl("");
      setFile(null);
    } catch (error: any) {
      alert("Error adding song: " + error.message);
    }
  };

  return (
    <Stack spacing={2} marginY={4}>
      <Typography variant="h6">Add a Song</Typography>
      <TextField
        label="YouTube URL"
        variant="outlined"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        fullWidth
      />
      <input
        type="file"
        onChange={(e) => setFile(e.target.files[0])}
        style={{ marginTop: 10 }}
      />
      <Button variant="contained" color="primary" onClick={handleSubmit}>
        Add Song
      </Button>
    </Stack>
  );
};

export default AddSong;
