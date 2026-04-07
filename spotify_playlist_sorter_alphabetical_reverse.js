// =========================
// BACKEND (Node.js + Express)
// =========================

// 1. Install deps:
// npm init -y
// npm install express axios cors dotenv

// 2. Create .env file:
// CLIENT_ID=your_spotify_client_id
// CLIENT_SECRET=your_spotify_client_secret
// REDIRECT_URI=http://localhost:3000/callback

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let access_token = null;

// STEP 1: Login
app.get('/login', (req, res) => {
  const scope = 'playlist-modify-public playlist-modify-private';
  const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(authURL);
});

// STEP 2: Callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  const tokenRes = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI
  }), {
    headers: {
      Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  access_token = tokenRes.data.access_token;
  res.send('Login successful. Go back to the app.');
});

// Helper: extract playlist ID from URL
function extractPlaylistId(url) {
  const match = url.match(/playlist\/(.*?)(\?|$)/);
  return match ? match[1] : null;
}

// STEP 3: Transform playlist
app.post('/transform', async (req, res) => {
  try {
    const { playlistUrl } = req.body;
    const playlistId = extractPlaylistId(playlistUrl);

    if (!playlistId) return res.status(400).send('Invalid URL');

    // Get user
    const me = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const userId = me.data.id;

    // Get tracks
    let tracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (url) {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${access_token}` }
      });

      tracks = tracks.concat(response.data.items);
      url = response.data.next;
    }

    // Sort tracks (reverse alphabetical by song name)
    tracks.sort((a, b) => {
      const nameA = a.track.name.toLowerCase();
      const nameB = b.track.name.toLowerCase();
      return nameA < nameB ? 1 : -1;
    });

    // Create new playlist
    const newPlaylist = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
      name: 'Sorted Playlist (Reverse A-Z)',
      description: 'Generated automatically',
      public: false
    }, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const newPlaylistId = newPlaylist.data.id;

    // Add tracks (in chunks of 100)
    const uris = tracks.map(t => t.track.uri);

    for (let i = 0; i < uris.length; i += 100) {
      await axios.post(`https://api.spotify.com/v1/playlists/${newPlaylistId}/tracks`, {
        uris: uris.slice(i, i + 100)
      }, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
    }

    res.send({ success: true, playlistId: newPlaylistId });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error processing playlist');
  }
});

app.listen(3001, () => console.log('Backend running on http://localhost:3001'));


// =========================
// FRONTEND (Simple HTML)
// =========================

// Save as index.html and open in browser

/*
<!DOCTYPE html>
<html>
<head>
  <title>Spotify Playlist Sorter</title>
</head>
<body>
  <h1>Spotify Playlist Sorter</h1>

  <button onclick="login()">Login with Spotify</button>
  <br><br>

  <input type="text" id="playlistUrl" placeholder="Paste playlist link" size="50" />
  <button onclick="transform()">Transform</button>

  <p id="result"></p>

  <script>
    function login() {
      window.location.href = 'http://localhost:3001/login';
    }

    async function transform() {
      const playlistUrl = document.getElementById('playlistUrl').value;

      const res = await fetch('http://localhost:3001/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistUrl })
      });

      const data = await res.json();

      if (data.success) {
        document.getElementById('result').innerHTML =
          'Playlist created! <a target="_blank" href="https://open.spotify.com/playlist/' + data.playlistId + '">Open</a>';
      } else {
        document.getElementById('result').innerText = 'Error';
      }
    }
  </script>
</body>
</html>
*/
