const express = require("express");
const { predict } = require("../controllers/mlController");

const router = express.Router();

router.post("/predict", predict);

module.exports = router;