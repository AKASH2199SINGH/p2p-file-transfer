import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer'; // Import the library
import './App.css';

const socket = io('http://localhost:8000');

function App() {
  const [file, setFile] = useState(null);
  const [senderRoomCode, setSenderRoomCode] = useState('');
  const [receiverRoomCode, setReceiverRoomCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select a file to begin.');

  // Store the file metadata and chunks
  const [fileInfo, setFileInfo] = useState(null);
  const fileChunks = useRef([]);

  // Store the WebRTC peer object
  const peerRef = useRef();

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server with socket ID:', socket.id);
    });

    socket.on('room-created', (code) => {
      console.log(`Room code received: ${code}`);
      setSenderRoomCode(code);
      setStatusMessage('Room created. Share the code!');
    });

    // --- SENDER'S LOGIC ---
    // The receiver has joined, time for the sender to create an "offer"
    socket.on('peer-connected', (peerId) => {
      console.log(`Peer ${peerId} connected. Creating peer connection...`);
      setStatusMessage('Peer connected! Creating P2P connection...');

      // Create a new peer (as the initiator)
      const peer = new Peer({
        initiator: true, // This user is the one initiating the connection
        trickle: false, // Use "trickle" for faster connection (we'll keep it simple for now)
      });
      peerRef.current = peer;

      // When the peer has a signal (the "offer"), send it to the receiver
      peer.on('signal', (signalData) => {
        socket.emit('webrtc-signal', {
          toSocketId: peerId, // Send it to the receiver who just joined
          signal: signalData,
        });
      });

      // When the connection is established, send the file
      peer.on('connect', () => {
        console.log('Peer connection established! Sending file...');
        setStatusMessage('Sending file...');
        
        // 1. Send file metadata first
        peer.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));
        
        // 2. Send the file data
        file.arrayBuffer().then(buffer => {
          peer.send(buffer);
        });
      });

      // Handle errors
      peer.on('error', (err) => console.error('Peer error:', err));
    });

    // --- RECEIVER'S LOGIC ---
    // The receiver gets the "offer" signal from the sender
    socket.on('webrtc-signal', ({ signal, fromSocketId }) => {
      console.log('Received WebRTC signal from', fromSocketId);

      // If we don't have a peer object yet, create one (as the receiver)
      if (!peerRef.current) {
        setStatusMessage('Connecting to peer...');
        const peer = new Peer({
          initiator: false, // This user is the receiver
          trickle: false,
        });
        peerRef.current = peer;

        // When this peer generates a signal (the "answer"), send it back
        peer.on('signal', (signalData) => {
          socket.emit('webrtc-signal', {
            toSocketId: fromSocketId, // Send it back to the original sender
            signal: signalData,
          });
        });

        // When the connection is established
        peer.on('connect', () => {
          console.log('Peer connection established! Ready to receive file.');
          setStatusMessage('Ready to receive file.');
        });

        // When file data is received
        peer.on('data', (data) => {
          handleReceivedData(data);
        });

        // Handle errors
        peer.on('error', (err) => console.error('Peer error:', err));
      }

      // Pass the received signal (the "offer") to the peer
      peerRef.current.signal(signal);
    });

    socket.on('room-not-found', () => {
      alert('Room code not found or is invalid. Please check the code.');
    });

  }, [file]); // Add 'file' to dependency array

  // Function to handle all incoming data (metadata or file chunks)
  const handleReceivedData = (data) => {
    try {
      // Check if it's metadata
      const metadata = JSON.parse(data.toString());
      if (metadata.fileName) {
        setFileInfo(metadata);
        fileChunks.current = []; // Reset chunks for new file
        setStatusMessage(`Receiving file: ${metadata.fileName}`);
        return;
      }
    } catch (e) {
      // If it's not JSON, it's a file chunk
    }

    // It's a file chunk, add it to the array
    fileChunks.current.push(data);

    if (fileInfo) {
      // Check if the file is complete
      const receivedSize = fileChunks.current.reduce((acc, chunk) => acc + chunk.length, 0);
      const percentage = Math.round((receivedSize / fileInfo.fileSize) * 100);
      setStatusMessage(`Receiving: ${percentage}%`);

      if (receivedSize === fileInfo.fileSize) {
        setStatusMessage('File received! Downloading...');
        
        // Assemble the file
        const fileBlob = new Blob(fileChunks.current);
        
        // Create a download link
        const url = URL.createObjectURL(fileBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileInfo.fileName;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        a.remove();
        URL.revokeObjectURL(url);
        setFileInfo(null);
        fileChunks.current = [];
      }
    }
  };

  const handleCreateRoom = () => {
    if (!file) {
      alert('Please select a file first!');
      return;
    }
    socket.emit('create-room');
  };

  const handleJoinRoom = () => {
    if (!receiverRoomCode.trim()) {
      alert('Please enter a room code.');
      return;
    }
    socket.emit('join-room', receiverRoomCode);
  };

  return (
    <div className="App">
      <h1>P2P File Transfer</h1>
      <p className="status">{statusMessage}</p>
      <div className="card">
        <h2>Sender</h2>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <button onClick={handleCreateRoom} disabled={!file}>Generate Code & Send</button>
        {senderRoomCode && (
          <div className="code-display">
            <p>Share this code:</p>
            <strong>{senderRoomCode}</strong>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Receiver</h2>
        <input
          type="text"
          placeholder="Enter code..."
          value={receiverRoomCode}
          onChange={(e) => setReceiverRoomCode(e.target.value)}
        />
        <button onClick={handleJoinRoom}>Connect & Receive</button>
      </div>
    </div>
  );
}

export default App;