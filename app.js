// ********** Imports **************
const expressLayouts = require('express-ejs-layouts');
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
require('dotenv').config({ quiet: true });

// Local utilities
const connectDB = require('./server/controllers/dbController');
const { sessionMiddleware } = require('./server/middleware/session/sessionMiddleware');
const { sessionValidator } = require('./server/middleware/session/sessionValidator');

// Import from Sahab core utilities
const { createAppLogger, createAuthMiddleware } = require('@sahab/core');

const User = require('./models/User');
const router = require('./server/router');

// ********** End Imports **********

// ********** Initialization **************
const app = express();
const logger = createAppLogger();

// Connect DB
logger.info('Running in ' + process.env.NODE_ENV + ' mode');
connectDB();

// Auth middleware from sahab-core
const auth = createAuthMiddleware();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// Session
app.use(
    sessionMiddleware({
        secret: process.env.SESSION_SECRET,
        cookieName: 'canvascue.sid',
        logger,
    })
);

// Session validator (local)
const { validateSession, enforceRole } = sessionValidator({
    UserModel: User,
    logger,
    loginPath: '/login',
    roleRedirects: {
        '/admin': ['admin'],
        '/dashboard': ['admin', 'client', 'designer'],
    },
});

// Auth + session middlewares
app.use(validateSession);
app.use(enforceRole);
app.use(auth.attachUser);

// ********** End Initialization **********

// Router
app.use('/', router);

// Start server
app.listen(process.env.PORT, () =>
    logger.info(`Server running on http://localhost:${process.env.PORT}`)
);
