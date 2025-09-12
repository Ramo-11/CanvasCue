// ********** Imports **************
const expressLayouts = require('express-ejs-layouts');
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

// Import from Sahab core utilities
const {
    createAppLogger,
    createDB,
    createSessionMiddleware,
    createAuthMiddleware,
    createSessionValidator,
} = require('@sahab/core');

const router = require('./server/router');

const logger = createAppLogger();

const { validateSession, enforceRole } = createSessionValidator({
    UserModel: require('./models/User'),
    logger,
    loginPath: '/login',
    roleRedirects: {
        '/admin': ['admin'],
        '/dashboard': ['admin', 'user'],
    },
});

// ********** End Imports **********

// ********** Initialization **************
const app = express();
require('dotenv').config({ quiet: true });

const db = createDB({ logger });
const auth = createAuthMiddleware();

logger.info('Running in ' + process.env.NODE_ENV + ' mode');
db.connect();

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
app.use(createSessionMiddleware());

// Auth middleware
app.use(validateSession);
app.use(enforceRole);
app.use(auth.attachUser);

// ********** End Initialization **********

app.use('/', router);

app.listen(process.env.PORT, () =>
    logger.info(`Server running on http://localhost:${process.env.PORT}`)
);
