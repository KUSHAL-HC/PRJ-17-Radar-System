const app = require("./app");

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`PRJ-17 Radar Backend running on port ${PORT}`);
});