import React from "react";
import { Container, CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";
import Player from "./components/Player";
import AddSong from "./components/AddSong";
import Playlist from "./components/Playlist";

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md">
        <Player />
        <AddSong />
        <Playlist />
      </Container>
    </ThemeProvider>
  );
};

export default App;
