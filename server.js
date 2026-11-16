
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
const execFileAsync = promisify(execFile);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

// TEMPORARY STORAGE
const tempDir = path.join(os.tmpdir(), "vinzz-downloader");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// MULTER CONFIG
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, randomUUID() + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      ".mp4", ".mov", ".webm", ".mkv",
      ".mp3", ".m4a", ".wav"
    ];

    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      return cb(new Error("Format file tidak didukung."));
    }

    cb(null, true);
  }
});

// PLATFORM DOMAIN CHECK
function isAllowedDomain(host, platform) {
  host = host.toLowerCase();

  const domains = {
    TikTok: ["tiktok.com"],
    Instagram: ["instagram.com"],
    YouTube: ["youtube.com", "youtu.be"]
  };

  const allowed = domains[platform];

  if (!allowed) return false;

  return allowed.some(domain =>
    host === domain || host.endsWith("." + domain)
  );
}

// HOME
app.get("/", (req, res) => {
  res.json({
    name: "VINZZ DOWNLOADER API",
    status: "ONLINE",
    version: "2.1.0",
    message: "Backend berhasil dijalankan."
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({
    status: "healthy"
  });
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

    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Format link tidak valid."
      });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({
        success: false,
        error: "Protokol link tidak valid."
      });
    }

    if (!isAllowedDomain(parsed.hostname, platform)) {
      return res.status(400).json({
        success: false,
        error: "Link tidak sesuai platform yang dipilih."
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
      nextStep: "Link sudah lolos pemeriksaan domain. Pengunduhan belum tersedia pada backend ini. Gunakan fitur ekspor resmi atau media yang kamu punya izin untuk proses."
    });

  } catch (error) {
    console.error("ANALYZE ERROR:", error);

    res.status(500).json({
      success: false,
      error: "Terjadi kesalahan pada server."
    });
  }
});

// CONVERT MEDIA YANG DIUNGGAH
app.post("/api/convert", upload.single("file"), async (req, res) => {
  let inputPath;
  let outputPath;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "File belum dipilih."
      });
    }

    inputPath = req.file.path;

    const format = String(req.body.format || "").toLowerCase();

    if (!["mp3", "mp4"].includes(format)) {
      fs.unlink(inputPath, () => {});

      return res.status(400).json({
        success: false,
        error: "Format harus MP3 atau MP4."
      });
    }

    outputPath = path.join(
      tempDir,
      randomUUID() + "." + format
    );

    const args = format === "mp3"
      ? [
          "-y",
          "-i", inputPath,
          "-vn",
          "-codec:a", "libmp3lame",
          "-q:a", "2",
          outputPath
        ]
      : [
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-c:a", "aac",
          "-movflags", "+faststart",
          outputPath
        ];

    await execFileAsync("ffmpeg", args, {
      timeout: 10 * 60 * 1000
    });

    res.download(outputPath, "VINZZ-CONVERT." + format, () => {
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    });

  } catch (error) {
    console.error("CONVERT ERROR:", error);

    if (inputPath) fs.unlink(inputPath, () => {});
    if (outputPath) fs.unlink(outputPath, () => {});

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Konversi gagal. Periksa file dan coba lagi."
      });
    }
  }
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error.message);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: error.code === "LIMIT_FILE_SIZE"
        ? "Ukuran file maksimal 200 MB."
        : "Upload file gagal."
    });
  }

  res.status(400).json({
    success: false,
    error: error.message || "Terjadi kesalahan."
  });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log("VINZZ DOWNLOADER API ONLINE");
  console.log("PORT:", PORT);
});



