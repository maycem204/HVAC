"use strict";

const express = require("express");
const identityAndTechnicians = require("./identity-technicians");
const appointments = require("./appointments");
const tariffsAndNotifications = require("./tariffs-notifications");
const leads = require("./leads");

const router = express.Router();

router.use(identityAndTechnicians);
router.use(appointments);
router.use(tariffsAndNotifications);
router.use(leads);

module.exports = router;
