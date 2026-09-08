const { predictUAV } = require("../services/mlService");

const predict = async (req, res) => {
  try {
    const radarData = req.body;

    if (!radarData || Object.keys(radarData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Radar observation data is required",
      });
    }

    const result = await predictUAV(radarData);

    return res.status(200).json({
      success: true,
      prediction: result,
    });
  } catch (error) {
    console.error("Prediction controller error:", error.message);

    return res.status(503).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  predict,
};