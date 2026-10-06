const fs = require('fs');
const path = require('path');
const express = require('express');
const { deleteOldSessions, readUser, stopForgedRequests } = require('./auth');
const { LIMITS, limitRequests } = require('./rate-limit');
const cropPhotos = require('./services/crop-photos');
const adminRoute = require('./routes/admin');
const chatRoute = require('./routes/chat');
const cropsRoute = require('./routes/crops');
const feedbackRoute = require('./routes/feedback');
const locationRoute = require('./routes/location');
const recommendRoute = require('./routes/recommend');
const usersRoute = require('./routes/users');
const weatherRoute = require('./routes/weather');

const app = express();
app.disable('x-powered-by');

// Behind a reverse proxy (nginx, a host's load balancer) every request seems to come from the proxy.
// TRUST_PROXY=1 tells Express to read the real address from the proxy, so limits work per person.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number.isInteger(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}

// Headers that tell the browser to be careful. They cost the phone app nothing.
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff', // never guess a file's type
    'X-Frame-Options': 'DENY', // nobody may show our pages inside a frame (clickjacking)
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    // The website may load scripts, styles and data only from our own address
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
      "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  });
  if (req.secure) {
    res.set('Strict-Transport-Security', 'max-age=31536000'); // only on https: use https from now on
  }
  next();
}
app.use(securityHeaders);

// The website, if it has been built (cd web; npm run build). Then one address serves both the site and the API.
const websiteFolder = path.join(__dirname, '../../web/dist');
const hasWebsite = fs.existsSync(path.join(websiteFolder, 'index.html'));
if (hasWebsite) {
  app.use(express.static(websiteFolder));
}

// The crop photos, for the phone app ("/crop-images/rice/4-seeds.jpg") and the website ("/api/crop-images/...").
// They are the same for everyone and do not change, so the phone and the browser may keep them for a week.
// A photo that is not there is "not found" (404), never the website's page.
app.use(
  ['/crop-images', '/api/crop-images'],
  express.static(cropPhotos.FOLDER, { maxAge: '7d', index: false }),
  (req, res) => res.status(404).end()
);

// Anyone sending more than this many API requests a minute from one address is stopped. The files above (the
// website and the photos) do not count: they cost the server almost nothing and the browser keeps them, while a
// whole class or village on one Wi-Fi shares one address.
app.use(limitRequests(LIMITS.apiPerMinute, 1));

app.use(express.json({ limit: '250kb' }));
app.use(stopForgedRequests);
app.use(readUser);

// The API. The phone app calls it at the root ("/users/login"); the website calls it under "/api"
// ("/api/users/login"), because "/admin" and other names are also pages of the website.
const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store'); // answers hold personal data: never keep a copy
  next();
});

api.get('/', (req, res) => {
  res.send('GreenRoot backend is running');
});

// Passwords can be guessed one name at a time, so logins and new accounts are limited per address as well
api.use(['/users/login', '/users/register', '/admin/login'], limitRequests(LIMITS.loginsPer15Minutes, 15));

api.use('/users', usersRoute);
api.use('/admin', adminRoute);
api.use('/location', locationRoute);
api.use('/recommend', recommendRoute);
api.use('/chat', chatRoute);
api.use('/feedback', feedbackRoute);
api.use('/weather', weatherRoute);
api.use('/crops', cropsRoute);

// An /api address that does not exist gets a short answer the website understands, not an HTML error page
app.use('/api', api, (req, res) => res.status(404).json({ error: 'not_found' }));
app.use(api);

// Any other address the browser asks for is a page of the website: it works out the page itself
if (hasWebsite) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts('html')) {
      return res.sendFile(path.join(websiteFolder, 'index.html'));
    }
    next();
  });
}

// Any error that a route didn't handle. A request whose body is not valid JSON is the sender's mistake (400).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'request_too_large' });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// Logins that have run out are deleted now and then
deleteOldSessions().catch(console.error);
setInterval(() => deleteOldSessions().catch(console.error), 60 * 60 * 1000).unref();

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
  if (hasWebsite) {
    console.log('The website (web/dist) is served from the same address');
  }
});
