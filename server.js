
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
const TMP = os.tmpdir();

app.use(helmet());
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: TMP,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [
      ".mp4", ".mov", ".webm", ".mkv",
      ".mp3", ".m4a", ".wav"
    ];

    cb(null, allowed.includes(ext));
  }
});

// HOME
app.get("/", (req, res) => {
  res.json({
    name: "VINZZ DOWNLOADER API",
    status: "ONLINE",
    version: "2.0.0",
    features: ["Analyze Link", "MP3 Conversion", "MP4 Conversion"]
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// ANALYZE LINK
app.post("/api/analyze", (req, res) => {
  try {
    const { url, platform, format } = req.body;

    if (!url || !platform || !format) {
      return res.status(400).json({
        success: false,
        error: "Link, platform, dan format wajib diisi."
      });
    }

    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL tidak valid.");
    }

    const host = parsed.hostname.toLowerCase();

    const platforms = {
      TikTok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"],
      Instagram: ["instagram.com", "www.instagram.com"],
      YouTube: ["youtube.com", "www.youtube.com", "youtu.be"]
    };

    if (!platforms[platform] || !platforms[platform].includes(host)) {
      return res.status(400).json({
        success: false,
        error: "Link tidak sesuai platform."
      });
    }

    if (!["mp3", "mp4"].includes(format)) {
      return res.status(400).json({
        success: false,
        error: "Format harus MP3 atau MP4."
      });
    }

    res.json({
      success: true,
      message: "Link berhasil diperiksa.",
      platform,
      format,
      nextStep: "Gunakan fitur unduh atau ekspor resmi platform."
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: "Link tidak valid."
    });
  }
});

// FILE CONVERSION
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
      ? [
          "-y", "-i", input,
          "-vn", "-codec:a", "libmp3lame",
          "-b:a", "192k", output
        ]
      : [
          "-y", "-i", input,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "23",
          "-c:a", "aac",
          "-movflags", "+faststart",
          output
        ];

    await exec("ffmpeg", args, { timeout: 180000 });

    const filename = "VINZZ-" + randomUUID() + "." + format;

    res.download(output, filename, () => {
      if (input) fs.promises.unlink(input).catch(() => {});
      if (output) fs.promises.unlink(output).catch(() => {});
    });

  } catch (error) {
    console.error("CONVERSION ERROR:", error.message);

    if (input) fs.promises.unlink(input).catch(() => {});
    if (output) fs.promises.unlink(output).catch(() => {});

    if (!res.headersSent) {
      res.status(500).json({
        error: "Pemrosesan gagal. Periksa file dan format."
      });
    }
  }
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err.message);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "Ukuran file maksimal 200 MB."
    });
  }

  res.status(400).json({
    error: "Permintaan tidak dapat diproses."
  });
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("VINZZ DOWNLOADER API running on port " + PORT);
});


