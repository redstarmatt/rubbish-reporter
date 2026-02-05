require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ExifParser = require('exif-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json());
app.use(express.static('public'));

// Categories for FixMyStreet reports
const CATEGORIES = [
  'Dog fouling',
  'Litter',
  'Fly-tipping',
  'Graffiti',
  'Abandoned vehicle',
  'Broken glass',
  'Needles/drug paraphernalia',
  'Overflowing bin',
  'Other'
];

// Analyze image with Gemini Vision
async function analyzeImage(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const prompt = `You are analyzing a photo of a street/public area issue that needs to be reported to the local council.

Analyze this image and provide:
1. The most appropriate category from this list: ${CATEGORIES.join(', ')}
2. A clear, factual description suitable for a council report (2-3 sentences max)

Respond in this exact JSON format:
{
  "category": "one of the categories listed",
  "description": "Clear description of the issue",
  "confidence": "high/medium/low"
}

If the image doesn't show a reportable street issue, respond with:
{
  "category": null,
  "description": "This image doesn't appear to show a reportable street issue",
  "confidence": "low"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse Gemini response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Extract GPS coordinates from image EXIF data
function extractLocation(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    const parser = ExifParser.create(buffer);
    const result = parser.parse();

    if (result.tags.GPSLatitude && result.tags.GPSLongitude) {
      return {
        latitude: result.tags.GPSLatitude,
        longitude: result.tags.GPSLongitude
      };
    }
  } catch (error) {
    console.log('Could not extract EXIF data:', error.message);
  }
  return null;
}

// API endpoint to analyze uploaded image
app.post('/api/analyze', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  const imagePath = req.file.path;

  try {
    // Extract location from EXIF
    const location = extractLocation(imagePath);

    // Analyze image with Gemini
    const analysis = await analyzeImage(imagePath);

    // Clean up uploaded file
    fs.unlinkSync(imagePath);

    res.json({
      success: true,
      analysis,
      location,
      categories: CATEGORIES
    });
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to submit report to FixMyStreet
app.post('/api/submit', async (req, res) => {
  const { latitude, longitude, category, description, name, email } = req.body;

  if (!latitude || !longitude || !category || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // FixMyStreet import endpoint
    // Note: This creates a report that still needs email confirmation
    const formData = new URLSearchParams();
    formData.append('service', 'FixMyStreet');
    formData.append('lat', latitude);
    formData.append('lon', longitude);
    formData.append('name', name || 'Anonymous');
    formData.append('email', email || '');
    formData.append('subject', category);
    formData.append('detail', description);

    const response = await fetch('https://www.fixmystreet.com/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const result = await response.text();

    // FixMyStreet returns different responses based on success/failure
    if (response.ok) {
      res.json({
        success: true,
        message: 'Report submitted! Check your email to confirm the report.',
        fixMyStreetResponse: result
      });
    } else {
      res.status(response.status).json({
        error: 'FixMyStreet submission failed',
        details: result
      });
    }
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
  console.log(`Rubbish Reporter running at http://localhost:${PORT}`);
});
