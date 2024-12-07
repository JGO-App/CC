const express = require('express');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const axios = require('axios');
const path = require('path');

dotenv.config();

const app = express();

app.use(express.json());

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});

const auth = admin.auth();

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

if (!FIREBASE_API_KEY) {
  console.error('FIREBASE_API_KEY is not defined in the environment variables.');
  process.exit(1);
}

const generateToken = (uid) => {
  return jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

app.post('/signup', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and displayName are required.' });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
    });

    const token = generateToken(userRecord.uid);

    res.status(201).json({
      message: 'User created successfully',
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      token,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    const { localId, idToken, email: userEmail, displayName } = response.data;

    const token = generateToken(localId);

    res.status(200).json({
      message: 'User signed in successfully',
      uid: localId,
      email: userEmail,
      displayName,
      token,
      idToken, 
    });
  } catch (error) {
    const errorMessage =
      error.response && error.response.data && error.response.data.error && error.response.data.error.message
        ? error.response.data.error.message
        : 'An error occurred during sign-in.';
    res.status(400).json({ error: errorMessage });
  }
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const tokenParts = authHeader.split(' ');

  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return res.status(400).json({ error: 'Invalid authorization header format. Expected "Bearer <token>".' });
  }

  const token = tokenParts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.uid;
    next(); 
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired token.' });
  }
};

app.get('/protected', verifyToken, async (req, res) => {
  try {
    const userRecord = await auth.getUser(req.user);

    res.status(200).json({
      message: `Hello ${userRecord.displayName || 'User'}, you have access to this protected route.`,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
    });
  } catch (error) {
    res.status(400).json({ error: 'User not found.' });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
