const express = require('express');
const { readUser } = require('./auth');
const adminRoute = require('./routes/admin');
const chatRoute = require('./routes/chat');
const feedbackRoute = require('./routes/feedback');
const locationRoute = require('./routes/location');
const recommendRoute = require('./routes/recommend');
const usersRoute = require('./routes/users');
const weatherRoute = require('./routes/weather');

const app = express();
app.use(express.json());
app.use(readUser);

app.get('/', (req, res) => {
  res.send('GreenRoot backend is running');
});

app.use('/users', usersRoute);
app.use('/admin', adminRoute);
app.use('/location', locationRoute);
app.use('/recommend', recommendRoute);
app.use('/chat', chatRoute);
app.use('/feedback', feedbackRoute);
app.use('/weather', weatherRoute);

// Any error that a route didn't handle. A request whose body is not valid JSON is the sender's mistake (400).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
