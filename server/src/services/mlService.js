const axios = require("axios");

const ML_API_URL = "http://localhost:8000";

const predictUAV = async (radarData) => {
  try {
    const response = await axios.post(
      `${ML_API_URL}/predict`,
      radarData,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "ML API Error:",
      error.response?.data || error.message
    );

    throw new Error("ML prediction service unavailable");
  }
};

module.exports = {
  predictUAV,
};
