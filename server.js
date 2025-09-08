import express from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import fs from "fs/promises";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// Initialize environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// Ensure upload directory exists
try {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  console.log(`Uploads directory ensured at ${UPLOAD_DIR}`);
} catch (err) {
  console.error(`Error creating uploads directory ${UPLOAD_DIR}:`, err);
  process.exit(1); // Kritik hata, uygulamayı durdur
}

// EJS setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(helmet()); // Security headers
app.use(morgan("combined")); // Request logging
app.use(cors()); // Enable CORS if needed
app.use(express.static(UPLOAD_DIR));
app.use(express.urlencoded({ extended: true }));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9.]/gi, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Input validation middleware
const validateInput = (req, res, next) => {
  const { testTitle, schoolName, description } = req.body;
  if (!testTitle || testTitle.trim().length === 0) {
    return res.status(400).json({ error: "Test başlığı zorunludur" });
  }
  if (testTitle.length > 100) {
    return res.status(400).json({ error: "Test başlığı 100 karakterden uzun olamaz" });
  }
  if (schoolName && schoolName.length > 100) {
    return res.status(400).json({ error: "Okul adı 100 karakterden uzun olamaz" });
  }
  if (description && description.length > 500) {
    return res.status(400).json({ error: "Açıklama 500 karakterden uzun olamaz" });
  }
  next();
};

// Main route
app.get("/", (req, res) => {
  res.render("index");
});

// PDF generation route
app.post("/generate", upload.array("questionImages", 60), validateInput, async (req, res) => {
  const images = req.files.map(f => f.path);
  const { testTitle, schoolName, description } = req.body;

  const doc = new PDFDocument({ size: "A4", margin: 40 });

  // Türkçe karakter desteği
  const fontPath = path.join(__dirname, "NotoSans-Medium.ttf");
  try {
    await fs.access(fontPath);
    doc.font(fontPath);
  } catch (err) {
    console.warn("Font file not found, using default font");
  }

  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  doc.on("end", async () => {
    const pdfData = Buffer.concat(buffers);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="test-${Date.now()}.pdf"`,
      "Content-Length": pdfData.length,
    });
    res.send(pdfData);

    // Clean up uploaded images
    await Promise.all(
      images.map(async (imgPath) => {
        try {
          const fullPath = path.resolve(imgPath);
          await fs.access(fullPath);
          await fs.unlink(fullPath);
        } catch (err) {
          console.error(`Error deleting file ${fullPath}:`, err);
        }
      })
    );
  });

  doc.on("error", async (err) => {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF oluşturma sırasında hata oluştu" });

    // Clean up files on error
    await Promise.all(
      images.map(async (imgPath) => {
        try {
          const fullPath = path.resolve(imgPath);
          await fs.access(fullPath);
          await fs.unlink(fullPath);
        } catch (err) {
          console.error(`Error deleting file ${fullPath}:`, err);
        }
      })
    );
  });

  // Grid settings
  const pageWidth = doc.page.width - 80;
  const pageHeight = doc.page.height - 160;
  const cols = 2;
  const rows = 4;
  const cellWidth = pageWidth / cols;
  const cellHeight = pageHeight / rows;
  const gap = 20;

  images.forEach((imgPath, idx) => {
    const positionInPage = idx % (cols * rows);

    if (positionInPage === 0) {
      if (idx !== 0) doc.addPage();

      // Başlık ve açıklama
      doc.fontSize(18).text(testTitle, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text(schoolName || "", { align: "center" });
      doc.fontSize(10).text(description || "", { align: "center" });
      doc.moveDown(1);

      // Dikey mavi çizgi
      const verticalLineX = 40 + cellWidth;
      doc.moveTo(verticalLineX, doc.y)
         .lineTo(verticalLineX, doc.page.height - 40)
         .strokeColor("blue")
         .lineWidth(2)
         .stroke();
    }

    // Resim pozisyonu
    const col = positionInPage % cols;
    const row = Math.floor(positionInPage / cols);
    const x = col === 0 ? 40 + 5 : 40 + cellWidth + gap + 5;
    const y = 150 + row * cellHeight;

    try {
      const fullPath = path.resolve(imgPath);
      doc.image(fullPath, x, y, {
        fit: [cellWidth - 10 - gap, cellHeight - 10],
        align: "center",
        valign: "center",
      });
    } catch (err) {
      console.error(`Error adding image ${imgPath}:`, err);
    }
  });

  doc.end();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Sunucuda bir hata oluştu" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Sayfa bulunamadı" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});