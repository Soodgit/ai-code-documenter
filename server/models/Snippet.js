const mongoose = require("mongoose");

const SnippetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    language: { type: String, required: true },
    code: { type: String, required: true },
    documentation: { type: String, default: "" },
    title: { type: String, default: "" },

  },
  { timestamps: true }
);

module.exports = mongoose.model("Snippet", SnippetSchema);
