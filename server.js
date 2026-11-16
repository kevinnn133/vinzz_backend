
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { randomUUID } = require("crypto");

const app = express();
const exec = promisify(execFile);

app.use(helmet());
app.use(cors());
app.use(express.json());

const TMP = os.tmpdir();

const upload = multer({
  dest: TMP,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, [
      ".mp4", ".mov", ".webm", ".mkv",
      ".mp3", ".m4a", ".wav"
    ].includes(ext));
  }
});

app.get("/", (req, res) => {
  res.json({
    name: "VINZZ DOWNLOADER API",
    status: "ONLINE",
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.post("/api/convert", upload.single("file"), async (req, res) => {
  let input;
  let output;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "File tidak tersedia atau format tidak didukung."
      });
    }

    input = req.file.path;

    const ext = path.extname(req.file.originalname).toLowerCase();
    const format = String(req.body.format || "").toLowerCase();

    if (!["mp3", "mp4"].includes(format)) {
      throw new Error("Format harus MP3 atau MP4.");
    }

    if (format === "mp4" &&
        [".mp3", ".m4a", ".wav"].includes(ext)) {
      throw new Error("Sumber tidak memiliki video.");
    }

    output = path.join(TMP, randomUUID() + "." + format);

    const args = format === "mp3"
      ? ["-y", "-i", input, "-vn", "-codec:a",
         "libmp3lame", "-b:a", "192k", output]
      : ["-y", "-i", input, "-c:v", "libx264",
         "-preset", "veryfast", "-crf", "23",
         "-c:a", "aac", "-movflags",
         "+faststart", output];

    await exec("ffmpeg", args, { timeout: 180000 });

    const filename = "VINZZ-" + randomUUID() + "." + format;

    res.download(output, filename, () => {
      if (input) fs.promises.unlink(input).catch(() => {});
      if (output) fs.promises.unlink(output).catch(() => {});
    });

  } catch (error) {
    console.error(error.message);

    if (input) fs.promises.unlink(input).catch(() => {});
    if (output) fs.promises.unlink(output).catch(() => {});

    if (!res.headersSent) {
      res.status(500).json({ error: "Pemrosesan gagal." });
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("VINZZ API running on port " + PORT);
});

