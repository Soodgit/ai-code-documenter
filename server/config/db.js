const mongoose = require("mongoose");


module.exports = async () => {
const uri = process.env.MONGO_URI;
if (!uri) throw new Error("MONGO_URI missing");
await mongoose.connect(uri, { dbName: "devdocs" });
console.log("✅ Mongo connected");
};