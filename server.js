const express = require('express');
const sql = require('mssql');
const session = require('express-session');
const helmet = require('helmet'); // Add Helmet for security headers
const multer = require('multer'); // Add multer for file uploads
const path = require('path');
const fs = require('fs'); // Add fs for file system operations
const _ = require('lodash'); // Add this line to require Lodash
const app = express();

app.use(helmet()); // Use Helmet to set security headers

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static('public'));

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Session middleware setup
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }  // Use 'true' in production with HTTPS
}));

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Use memory storage for multer
const upload = multer({ storage: storage });

// Database configuration
const config = {
  user: 'Ahmed',
  password: 'Shefoo_2003',
  server: 'hagoidsfluffy.database.windows.net',
  database: 'mysql',
  options: {
    encrypt: true // Use this if you're on Windows Azure
  }
};

// Connect to the database
sql.connect(config, err => {
  if (err) console.log('Database connection error:', err);
  else console.log('Connected to Azure SQL Database');
});

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.session.user && (req.session.user.isAdmin === true || req.session.user.isAdmin === 1)) {
      return next();
  } else {
      res.redirect('/login');
  }
}

// Middleware to check if user is sub-admin
function isSubAdmin(req, res, next) {
  if (req.session.user && (req.session.user.isSubAdmin === true || req.session.user.isSubAdmin === 1)) {
      return next();
  } else {
      res.redirect('/login');
  }
}

// Routes
app.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    res.render('index', { user: req.session.user });
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/signup', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    res.render('signup', { user: req.session.user });
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/login', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    res.render('login', { user: req.session.user });
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).send('Internal server error');
  }
});

// Define the unique code required for signup
const UNIQUE_CODE = 'MLSAKFSHEROS';

// Signup Route
app.post('/signup', async (req, res) => {
  const { username, password, uniqueCode, isAdmin } = req.body;

  // Check if the unique code is correct
  if (uniqueCode !== UNIQUE_CODE) {
    return res.render('signup', { error: 'Invalid unique code', username, password, user: req.session.user });
  }

  try {
    const pool = await sql.connect(config);
    
    // Check if the username already exists
    const userCheck = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT * FROM Users WHERE Username = @username');
    
    if (userCheck.recordset.length > 0) {
      // Username already exists
      return res.render('signup', { error: 'Username is already taken', username, password, user: req.session.user });
    }

    // Create a new user
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, password)
      .input('isAdmin', sql.Bit, isAdmin || 0)  // Default to 0 if not specified
      .input('isSubAdmin', sql.Bit, 0)  // Explicitly set isSubAdmin to 0 for new users
      .query('INSERT INTO Users (username, password, isAdmin, isSubAdmin) VALUES (@username, @password, @isAdmin, @isSubAdmin); SELECT SCOPE_IDENTITY() AS UserId');

    req.session.user = { 
      username,  // Ensure username is set
      UserId: result.recordset[0].UserId,  
      isAdmin: result.recordset[0].isAdmin,  // Save the admin status in session
      isSubAdmin: 0  // Save the sub-admin status in session as 0
    };
    res.redirect('/home');
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).send('Error creating user');
  }
});

// Login Route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, password)
      .query('SELECT * FROM Users WHERE Username = @username AND password = @password');  // Note the capital 'U' in 'Username'

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      req.session.user = {
        UserId: user.UserId,
        username: user.Username,  // Ensure 'Username' is set with a capital 'U'
        isAdmin: user.isAdmin,  // Set isAdmin in session
        isSubAdmin: user.isSubAdmin  // Set isSubAdmin in session
      };
      res.redirect('/home');
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal server error');
  }
});

// Home Route
app.get('/home', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  try {
    const pool = await sql.connect(config);
    const eventsResult = await pool.request().query('SELECT * FROM Events');

    res.render('home', {
      username: req.session.user.username,
      isAdmin: req.session.user.isAdmin,
      user: req.session.user,
      events: eventsResult.recordset // Ensure events data is passed to the template
    });
  } catch (error) {
    console.error('Error loading home page:', error);
    res.status(400).send('Error loading home page');
  }
});

// Events Route
app.get('/events', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  try {
    const pool = await sql.connect(config);
    const eventsResult = await pool.request()
      .input('UserId', sql.Int, req.session.user.UserId)  // Declare the input variable before the query
      .query(`
        SELECT e.EventId, e.EventName, e.EventDate, e.EventLocation,
        CASE WHEN ue.UserId IS NOT NULL THEN 1 ELSE 0 END AS IsRegistered
        FROM Events e
        LEFT JOIN UserEvents ue ON e.EventId = ue.EventId AND ue.UserId = @UserId
      `);

    res.render('events', {
      events: eventsResult.recordset,
      userEvents: eventsResult.recordset.filter(event => event.IsRegistered),  // Filter registered events
      isAdmin: req.session.user.isAdmin,  // Pass isAdmin to the view
      user: req.session.user
    });
  } catch (error) {
    console.error('Error loading events:', error);
    res.status(400).send('Error loading events');
  }
});

// Register for an event
app.post('/register-event', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const { eventId } = req.body;
  try {
    const pool = await sql.connect(config);
    await pool.request()
      .input('UserId', sql.Int, req.session.user.UserId)
      .input('EventId', sql.Int, eventId)
      .query('INSERT INTO UserEvents (UserId, EventId) VALUES (@UserId, @EventId)');
    res.redirect('/events');
  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(400).send('Error registering for event');
  }
});

// Admin Panel Route
app.get('/admin', isAdmin, async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const eventsResult = await pool.request().query(`
      SELECT e.EventId, e.EventName, e.EventDate, COUNT(ue.UserId) AS RegistrationCount
      FROM Events e
      LEFT JOIN UserEvents ue ON e.EventId = ue.EventId
      GROUP BY e.EventId, e.EventName, e.EventDate
    `);

    const usersResult = await pool.request().query(`
      SELECT ue.EventId, u.username
      FROM UserEvents ue
      JOIN Users u ON ue.UserId = u.UserId
    `);

    const events = eventsResult.recordset;
    const users = usersResult.recordset;

    // Combine event and user data
    events.forEach(event => {
      event.users = users.filter(user => user.EventId === event.EventId).map(user => user.username);
    });

    res.render('admin', {
      username: req.session.user.username,
      events: events,
      _ , // Pass Lodash to the template
      user: req.session.user
    });
  } catch (error) {
    console.error('Error loading admin panel:', error);
    res.status(400).send('Error loading admin panel');
  }
});

// Admin Add Event Route
app.post('/admin/add-event', isAdmin, async (req, res) => {
  const { eventName, eventDate } = req.body;

  try {
    const pool = await sql.connect(config);
    await pool.request()
        .input('eventName', sql.VarChar, eventName)
        .input('eventDate', sql.Date, eventDate)
        .query('INSERT INTO Events (eventName, EventDate) VALUES (@eventName, @eventDate)');
    res.redirect('/admin');
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(400).send('Error adding event');
  }
});

// Blog Posts Route
app.get('/blog', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const postsResult = await pool.request().query('SELECT * FROM BlogPosts ORDER BY CreatedAt DESC');

    res.render('blog', {
      posts: postsResult.recordset,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error loading blog posts:', error);
    res.status(400).send('Error loading blog posts');
  }
});

// Single Blog Post Route
app.get('/blog/:postId', async (req, res) => {
  const { postId } = req.params;
  try {
    const pool = await sql.connect(config);
    const postResult = await pool.request()
      .input('postId', sql.Int, postId)
      .query('SELECT * FROM BlogPosts WHERE PostId = @postId');
    const commentsResult = await pool.request()
      .input('postId', sql.Int, postId)
      .query('SELECT * FROM Comments WHERE PostId = @postId ORDER BY CreatedAt ASC');

    res.render('post', {
      post: postResult.recordset[0],
      comments: commentsResult.recordset,
      user: req.session.user
    });
  } catch (error) {
    console.error('Error loading blog post:', error);
    res.status(400).send('Error loading blog post');
  }
});

// Add Blog Post Route
app.post('/blog/add', isAdmin, upload.single('photo'), async (req, res) => {
  const { title, content } = req.body;
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const pool = await sql.connect(config);
    await pool.request()
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('photo', sql.NVarChar, photo)
      .input('authorId', sql.Int, req.session.user.UserId)
      .query('INSERT INTO BlogPosts (Title, Content, Photo, AuthorId) VALUES (@title, @content, @photo, @authorId)');
    res.redirect('/blog');
  } catch (error) {
    console.error('Error adding blog post:', error);
    res.status(400).send('Error adding blog post');
  }
});

// Delete Blog Post Route
app.post('/blog/:postId/delete', isAdmin, async (req, res) => {
  const { postId } = req.params;
  try {
    const pool = await sql.connect(config);
    // Delete associated comments first
    await pool.request().input('postId', sql.Int, postId).query('DELETE FROM Comments WHERE PostId = @postId');
    // Now delete the blog post
    await pool.request().input('postId', sql.Int, postId).query('DELETE FROM BlogPosts WHERE PostId = @postId');
    res.redirect('/blog');
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(400).send('Error deleting blog post');
  }
});

// Listen on the correct port
const port = process.env.port || 8080; // Set to port 80 for Azure
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Start the server
const PORT = process.env.PORT || 80; // Use the PORT environment variable
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


