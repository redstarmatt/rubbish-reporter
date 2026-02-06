require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ExifParser = require('exif-parser');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Love Clean Streets session management
let lcsSession = {
  cookies: null,
  bearerToken: null,
  apiKey: null,
  email: null,
  categories: null,
  lastLogin: null
};

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json());
app.use(express.static('public'));

// Categories for reports
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

// Love Clean Streets URLs
const LCS_BASE = 'https://lovecleanstreets.com';
const LCS_API = 'https://api.mediaklik.com';

// Extract cookies from response headers
function extractCookies(response) {
  const cookies = {};
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  setCookieHeaders.forEach(cookie => {
    const parts = cookie.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookies[parts[0]] = parts.slice(1).join('=');
    }
  });
  return cookies;
}

// Format cookies for request header
function formatCookies(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Login to Love Clean Streets and get API credentials
async function lcsLogin() {
  const email = process.env.LCS_EMAIL;
  const password = process.env.LCS_PASSWORD;

  if (!email || !password) {
    throw new Error('Love Clean Streets credentials not configured (LCS_EMAIL, LCS_PASSWORD)');
  }

  console.log('Logging into Love Clean Streets...');

  // Step 1: Get login page to extract CSRF token
  const loginPageRes = await fetch(`${LCS_BASE}/Registration/Login`);
  let cookies = extractCookies(loginPageRes);
  const loginPageHtml = await loginPageRes.text();
  const $ = cheerio.load(loginPageHtml);

  const csrfToken = $('form[action="/Registration/Login"] input[name="__RequestVerificationToken"]').val();
  if (!csrfToken) {
    throw new Error('Could not find CSRF token on login page');
  }

  // Step 2: Submit login form
  const loginData = new URLSearchParams();
  loginData.append('UserName', email);
  loginData.append('Password', password);
  loginData.append('__RequestVerificationToken', csrfToken);
  loginData.append('RememberMe', 'true');

  const loginRes = await fetch(`${LCS_BASE}/Registration/Login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies)
    },
    body: loginData.toString(),
    redirect: 'manual'
  });

  const newCookies = extractCookies(loginRes);
  cookies = { ...cookies, ...newCookies };

  const loginLocation = loginRes.headers.get('location');
  if (loginRes.status !== 302 || !loginLocation || loginLocation.includes('Login')) {
    throw new Error('Love Clean Streets login failed - check credentials');
  }

  console.log('Login successful');
  lcsSession.cookies = cookies;
  lcsSession.email = email;

  // Step 3: Get the Reports/Add page to extract Bearer token and API key
  const formRes = await fetch(`${LCS_BASE}/Reports/Add`, {
    headers: { 'Cookie': formatCookies(cookies) }
  });

  const formHtml = await formRes.text();

  // Extract Bearer token
  const bearerMatch = formHtml.match(/Bearer:\s*"([^"]+)"/);
  if (!bearerMatch) {
    throw new Error('Could not find Bearer token');
  }
  lcsSession.bearerToken = bearerMatch[1];

  // Extract API key
  const apiKeyMatch = formHtml.match(/ApiKey:\s*"([^"]+)"/);
  if (apiKeyMatch) {
    lcsSession.apiKey = apiKeyMatch[1];
  } else {
    lcsSession.apiKey = '4E169020-AE0B-46C8-A4A2-E97294962912'; // Default public key
  }

  lcsSession.lastLogin = Date.now();
  console.log('Got API credentials');

  return true;
}

// Ensure we have a valid LCS session
async function ensureLcsSession() {
  const sessionAge = Date.now() - (lcsSession.lastLogin || 0);
  // Re-login if no session or older than 55 minutes (tokens expire at 60)
  if (!lcsSession.bearerToken || sessionAge > 55 * 60 * 1000) {
    await lcsLogin();
  }
  return lcsSession;
}

// Get categories for a location from LCS API
async function getLcsCategories(latitude, longitude) {
  const session = await ensureLcsSession();

  const url = `${LCS_API}/v2/categories?latitude=${latitude}&longitude=${longitude}&app-key=${session.apiKey}&device-uuid=rubbish-reporter`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Authorization': `Bearer ${session.bearerToken}`
    }
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to get categories: ${error}`);
  }

  const data = await res.json();
  return data.Categories || data;
}

// Find matching category ID
async function findCategoryId(latitude, longitude, categoryName) {
  const categories = await getLcsCategories(latitude, longitude);

  // Map our category names to likely LCS names
  const nameVariants = {
    'Dog fouling': ['Dog Fouling', 'Dog Waste', 'Dog Mess', 'Dog Poo'],
    'Litter': ['Litter', 'Litter/Rubbish', 'Street Litter'],
    'Fly-tipping': ['Fly Tipping', 'Fly-Tipping', 'Flytipping', 'Dumped Rubbish'],
    'Graffiti': ['Graffiti', 'Graffiti/Tags'],
    'Abandoned vehicle': ['Abandoned Vehicle', 'Abandoned Car'],
    'Broken glass': ['Broken Glass', 'Glass', 'Dangerous Litter'],
    'Needles/drug paraphernalia': ['Drug Related Litter', 'Needles', 'Sharps', 'Drug Paraphernalia'],
    'Overflowing bin': ['Overflowing Litter Bin', 'Full Bin', 'Overflowing Bin'],
    'Other': ['Other', 'General']
  };

  const variants = nameVariants[categoryName] || [categoryName];

  for (const cat of categories) {
    const catName = cat.Name || cat.name;
    for (const variant of variants) {
      if (catName && catName.toLowerCase().includes(variant.toLowerCase())) {
        return cat.Id || cat.id || cat.CategoryId;
      }
    }
  }

  // If no match, use first available category or throw
  if (categories.length > 0) {
    console.log('No exact category match, using first available:', categories[0].Name);
    return categories[0].Id || categories[0].id || categories[0].CategoryId;
  }

  throw new Error('No categories available for this location');
}

// Submit report to Love Clean Streets API
async function submitToLcs(latitude, longitude, category, description, reporterName) {
  const session = await ensureLcsSession();

  // Get category ID
  const categoryId = await findCategoryId(latitude, longitude, category);
  console.log(`Using category ID: ${categoryId} for "${category}"`);

  // Build report payload
  const report = {
    CategoryId: categoryId,
    DateTimeRecorded: new Date().toISOString(),
    Description: description || `${category} reported via Rubbish Reporter`,
    Images: [],
    Latitude: latitude,
    Longitude: longitude,
    NotifyEmail: true,
    Id: '00000000-0000-0000-0000-000000000000',
    ResponseRequired: true,
    Tags: [],
    StatusId: 1,
    Email: session.email,
    Answers: [],
    Address: ''
  };

  // Submit to API
  const url = `${LCS_API}/v2/reports?app-key=${session.apiKey}&device-uuid=rubbish-reporter`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.bearerToken}`
    },
    body: JSON.stringify(report)
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('LCS API error:', error);
    throw new Error(`LCS API error: ${res.status}`);
  }

  const result = await res.json();
  console.log('Report submitted successfully:', result.Id);

  return {
    success: true,
    message: 'Report submitted to Love Clean Streets!',
    reportId: result.Id
  };
}

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

// API endpoint to submit report to Love Clean Streets
app.post('/api/submit', async (req, res) => {
  const { latitude, longitude, category, description, name, email } = req.body;

  if (!latitude || !longitude || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Try Love Clean Streets first
    if (process.env.LCS_EMAIL && process.env.LCS_PASSWORD) {
      try {
        const result = await submitToLcs(
          latitude,
          longitude,
          category,
          description || category,
          name || 'Anonymous'
        );

        return res.json({
          success: true,
          message: result.message,
          service: 'LoveCleanStreets'
        });
      } catch (lcsError) {
        console.error('Love Clean Streets error:', lcsError.message);
        // Fall through to FixMyStreet if LCS fails
        console.log('Falling back to FixMyStreet...');
      }
    }

    // Fallback to FixMyStreet
    const formData = new URLSearchParams();
    formData.append('service', 'FixMyStreet');
    formData.append('lat', latitude);
    formData.append('lon', longitude);
    formData.append('name', name || 'Anonymous');
    formData.append('email', email || '');
    formData.append('subject', category);
    formData.append('detail', description || category);

    const response = await fetch('https://www.fixmystreet.com/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const result = await response.text();

    if (response.ok) {
      res.json({
        success: true,
        message: 'Report submitted! Check your email to confirm the report.',
        service: 'FixMyStreet',
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

// Test LCS connection
app.get('/api/test-lcs', async (req, res) => {
  try {
    await ensureLcsSession();
    res.json({
      success: true,
      message: 'Love Clean Streets login successful!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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
