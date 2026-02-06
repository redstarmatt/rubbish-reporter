// DOM elements
const photoInput = document.getElementById('photo-input');
const preview = document.getElementById('preview');
const analyzeBtn = document.getElementById('analyze-btn');
const loading = document.getElementById('loading');
const reviewContent = document.getElementById('review-content');
const categorySelect = document.getElementById('category');
const descriptionInput = document.getElementById('description');
const locationText = document.getElementById('location-text');
const getLocationBtn = document.getElementById('get-location-btn');
const mapContainer = document.getElementById('map-container');
const coordsSpan = document.getElementById('coords');
const emailInput = document.getElementById('email');
const nameInput = document.getElementById('name');
const backBtn = document.getElementById('back-btn');
const submitBtn = document.getElementById('submit-btn');
const newReportBtn = document.getElementById('new-report-btn');
const successMessage = document.getElementById('success-message');
const errorToast = document.getElementById('error-toast');
const savedLocationsDiv = document.getElementById('saved-locations');
const locationList = document.getElementById('location-list');
const regularReportsDiv = document.getElementById('regular-reports');
const regularList = document.getElementById('regular-list');
const regularNameInput = document.getElementById('regular-name');
const saveRegularBtn = document.getElementById('save-regular-btn');
const saveRegularPrompt = document.getElementById('save-regular-prompt');
const addRegularBtn = document.getElementById('add-regular-btn');
const regularReportName = document.getElementById('regular-report-name');
const regularCategorySelect = document.getElementById('regular-category');
const regularDescriptionInput = document.getElementById('regular-description');
const regularLocationText = document.getElementById('regular-location-text');
const regularGetLocationBtn = document.getElementById('regular-get-location-btn');
const regularMapContainer = document.getElementById('regular-map-container');
const cancelRegularBtn = document.getElementById('cancel-regular-btn');
const createRegularBtn = document.getElementById('create-regular-btn');

// State
let currentPhoto = null;
let currentLocation = null;
let currentCategory = null;
let currentDescription = null;
let savedLocations = [];
let regularReports = [];
let map = null;
let marker = null;
let regularMap = null;
let regularMarker = null;
let regularLocation = null;

// Load saved locations from localStorage
function loadSavedLocations() {
  const saved = localStorage.getItem('rubbish-reporter-locations');
  if (saved) {
    savedLocations = JSON.parse(saved);
  }
  renderSavedLocations();
}

// Save locations to localStorage
function saveSavedLocations() {
  localStorage.setItem('rubbish-reporter-locations', JSON.stringify(savedLocations));
  renderSavedLocations();
}

// Render the saved locations list
function renderSavedLocations() {
  if (savedLocations.length === 0) {
    savedLocationsDiv.classList.add('hidden');
    return;
  }

  savedLocationsDiv.classList.remove('hidden');
  locationList.innerHTML = '';

  savedLocations.forEach((loc, index) => {
    const item = document.createElement('div');
    item.className = 'saved-location-item';
    item.innerHTML = `
      <div class="location-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
      <div class="location-info">
        <div class="location-name">${escapeHtml(loc.name)}</div>
        <div class="location-coords">${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</div>
      </div>
      <button class="delete-btn" data-index="${index}" title="Delete">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Click to use this location
    item.querySelector('.location-info').addEventListener('click', () => {
      useSavedLocation(loc);
    });
    item.querySelector('.location-icon').addEventListener('click', () => {
      useSavedLocation(loc);
    });

    // Delete button
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedLocation(index);
    });

    locationList.appendChild(item);
  });
}

// Use a saved location for quick report
function useSavedLocation(loc) {
  currentLocation = {
    latitude: loc.latitude,
    longitude: loc.longitude
  };
  // Trigger photo selection - the location is pre-filled
  photoInput.click();
}

// Delete a saved location
function deleteSavedLocation(index) {
  savedLocations.splice(index, 1);
  saveSavedLocations();
}

// Load regular reports from localStorage
function loadRegularReports() {
  const saved = localStorage.getItem('rubbish-reporter-regulars');
  if (saved) {
    regularReports = JSON.parse(saved);
  }
  renderRegularReports();
}

// Save regular reports to localStorage
function saveRegularReports() {
  localStorage.setItem('rubbish-reporter-regulars', JSON.stringify(regularReports));
  renderRegularReports();
}

// Render regular reports list
function renderRegularReports() {
  if (regularReports.length === 0) {
    regularReportsDiv.classList.add('hidden');
    return;
  }

  regularReportsDiv.classList.remove('hidden');
  regularList.innerHTML = '';

  regularReports.forEach((report, index) => {
    const item = document.createElement('div');
    item.className = 'regular-report-item';
    item.dataset.index = index;
    item.innerHTML = `
      <div class="report-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <div class="report-info">
        <div class="report-name">${escapeHtml(report.name)}</div>
        <div class="report-details">${escapeHtml(report.category)}</div>
      </div>
      <button class="delete-btn" data-index="${index}" title="Delete">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Click to submit this report
    item.querySelector('.report-info').addEventListener('click', () => {
      submitRegularReport(report, item);
    });
    item.querySelector('.report-icon').addEventListener('click', () => {
      submitRegularReport(report, item);
    });

    // Delete button
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRegularReport(index);
    });

    regularList.appendChild(item);
  });
}

// Submit a regular report instantly
async function submitRegularReport(report, itemElement) {
  const email = localStorage.getItem('rubbish-reporter-email');
  const name = localStorage.getItem('rubbish-reporter-name') || 'Anonymous';

  if (!email) {
    showError('Please set your email first by submitting a normal report');
    return;
  }

  itemElement.classList.add('submitting');
  const originalName = itemElement.querySelector('.report-name').textContent;
  itemElement.querySelector('.report-name').textContent = 'Submitting...';

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: report.latitude,
        longitude: report.longitude,
        category: report.category,
        description: report.description,
        email: email,
        name: name
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Submission failed');
    }

    // Show success with service indicator
    const successText = data.service === 'LoveCleanStreets' ? 'Submitted!' : 'Submitted (check email)';
    itemElement.querySelector('.report-name').textContent = successText;
    setTimeout(() => {
      itemElement.classList.remove('submitting');
      itemElement.querySelector('.report-name').textContent = originalName;
    }, 2000);

  } catch (error) {
    console.error('Regular report error:', error);
    showError(error.message);
    itemElement.classList.remove('submitting');
    itemElement.querySelector('.report-name').textContent = originalName;
  }
}

// Delete a regular report
function deleteRegularReport(index) {
  regularReports.splice(index, 1);
  saveRegularReports();
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show a specific step
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(step => {
    step.classList.remove('active');
  });
  document.getElementById(stepId).classList.add('active');
}

// Show error toast
function showError(message) {
  errorToast.textContent = message;
  errorToast.classList.remove('hidden');
  setTimeout(() => {
    errorToast.classList.add('hidden');
  }, 5000);
}

// Handle photo selection
photoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  currentPhoto = file;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    analyzeBtn.classList.remove('hidden');

    // Scroll to analyze button so user can see it
    setTimeout(() => {
      analyzeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };
  reader.readAsDataURL(file);
});

// Analyze photo
analyzeBtn.addEventListener('click', async () => {
  if (!currentPhoto) return;

  showStep('step-review');
  loading.classList.remove('hidden');
  reviewContent.classList.add('hidden');

  try {
    const formData = new FormData();
    formData.append('photo', currentPhoto);

    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Analysis failed');
    }

    // Populate categories
    categorySelect.innerHTML = '';
    data.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      if (data.analysis.category === cat) {
        option.selected = true;
      }
      categorySelect.appendChild(option);
    });

    // Set description
    descriptionInput.value = data.analysis.description || '';

    // Set location: use pre-selected saved location, EXIF data, or nothing
    if (!currentLocation && data.location) {
      currentLocation = data.location;
    }
    updateLocationDisplay();

    loading.classList.add('hidden');
    reviewContent.classList.remove('hidden');

  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message);
    showStep('step-photo');
  }
});

// Update location display and map
function updateLocationDisplay() {
  if (currentLocation) {
    const lat = currentLocation.latitude;
    const lon = currentLocation.longitude;
    locationText.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    mapContainer.classList.remove('hidden');
    getLocationBtn.textContent = 'Update Location';

    // Initialize or update map
    if (!map) {
      map = L.map('map').setView([lat, lon], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      marker = L.marker([lat, lon], { draggable: true }).addTo(map);

      // Update location when marker is dragged
      marker.on('dragend', function(e) {
        const pos = marker.getLatLng();
        currentLocation = {
          latitude: pos.lat,
          longitude: pos.lng
        };
        locationText.textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
      });
    } else {
      map.setView([lat, lon], 17);
      marker.setLatLng([lat, lon]);
    }

    // Fix map rendering issue when container was hidden
    setTimeout(() => map.invalidateSize(), 100);
  } else {
    locationText.textContent = 'No location data';
    mapContainer.classList.add('hidden');
    getLocationBtn.textContent = 'Use Current Location';
  }
}

// Get current location
getLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser');
    return;
  }

  getLocationBtn.textContent = 'Getting location...';
  getLocationBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      updateLocationDisplay();
      getLocationBtn.disabled = false;
    },
    (error) => {
      showError('Could not get your location: ' + error.message);
      getLocationBtn.textContent = 'Use Current Location';
      getLocationBtn.disabled = false;
    },
    { enableHighAccuracy: true }
  );
});

// Back button
backBtn.addEventListener('click', () => {
  // Reset map when going back
  if (map) {
    map.remove();
    map = null;
    marker = null;
  }
  showStep('step-photo');
});

// Submit report
submitBtn.addEventListener('click', async () => {
  if (!currentLocation) {
    showError('Please provide a location for the report');
    return;
  }

  const email = emailInput.value.trim();
  if (!email) {
    showError('Please enter your email address');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        category: categorySelect.value,
        description: descriptionInput.value,
        email: email,
        name: nameInput.value || 'Anonymous'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Submission failed');
    }

    // Show success message with service info
    let msg = data.message || 'Report submitted!';
    if (data.service === 'LoveCleanStreets') {
      msg = 'Report submitted to Love Clean Streets! No email confirmation needed.';
    }
    successMessage.textContent = msg;

    // Store current values for potential saving as regular report
    currentCategory = categorySelect.value;
    currentDescription = descriptionInput.value;

    // Show save as regular report option
    saveRegularPrompt.classList.remove('hidden');
    regularNameInput.value = '';

    showStep('step-done');

  } catch (error) {
    console.error('Submission error:', error);
    showError(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
});

// Save as regular report button
saveRegularBtn.addEventListener('click', () => {
  const name = regularNameInput.value.trim();
  if (!name) {
    showError('Please enter a name for this report');
    return;
  }

  if (!currentLocation || !currentCategory) {
    showError('No report data to save');
    return;
  }

  regularReports.push({
    name: name,
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    category: currentCategory,
    description: currentDescription
  });

  saveRegularReports();
  saveRegularPrompt.classList.add('hidden');

  // Show confirmation
  const originalText = saveRegularBtn.textContent;
  saveRegularBtn.textContent = 'Saved!';
  saveRegularBtn.disabled = true;
  setTimeout(() => {
    saveRegularBtn.textContent = originalText;
    saveRegularBtn.disabled = false;
  }, 1500);
});

// New report button
newReportBtn.addEventListener('click', () => {
  // Reset state
  currentPhoto = null;
  currentLocation = null;
  photoInput.value = '';
  preview.classList.add('hidden');
  analyzeBtn.classList.add('hidden');

  // Reset map
  if (map) {
    map.remove();
    map = null;
    marker = null;
  }

  showStep('step-photo');
});

// Load saved email from localStorage (with default)
const DEFAULT_EMAIL = 'matt.lewsey@gmail.com';

if (localStorage.getItem('rubbish-reporter-email')) {
  emailInput.value = localStorage.getItem('rubbish-reporter-email');
} else {
  emailInput.value = DEFAULT_EMAIL;
  localStorage.setItem('rubbish-reporter-email', DEFAULT_EMAIL);
}
if (localStorage.getItem('rubbish-reporter-name')) {
  nameInput.value = localStorage.getItem('rubbish-reporter-name');
}

// Save email/name on input
emailInput.addEventListener('change', () => {
  localStorage.setItem('rubbish-reporter-email', emailInput.value);
});
nameInput.addEventListener('change', () => {
  localStorage.setItem('rubbish-reporter-name', nameInput.value);
});

// Add Regular Report button
addRegularBtn.addEventListener('click', () => {
  regularLocation = null;
  regularReportName.value = '';
  regularDescriptionInput.value = '';
  regularCategorySelect.selectedIndex = 0;
  regularLocationText.textContent = 'No location set';
  regularMapContainer.classList.add('hidden');

  if (regularMap) {
    regularMap.remove();
    regularMap = null;
    regularMarker = null;
  }

  showStep('step-add-regular');
});

// Cancel adding regular report
cancelRegularBtn.addEventListener('click', () => {
  if (regularMap) {
    regularMap.remove();
    regularMap = null;
    regularMarker = null;
  }
  showStep('step-photo');
});

// Get location for regular report
regularGetLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser');
    return;
  }

  regularGetLocationBtn.textContent = 'Getting location...';
  regularGetLocationBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      regularLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      updateRegularLocationDisplay();
      regularGetLocationBtn.disabled = false;
      regularGetLocationBtn.textContent = 'Update Location';
    },
    (error) => {
      showError('Could not get your location: ' + error.message);
      regularGetLocationBtn.textContent = 'Use Current Location';
      regularGetLocationBtn.disabled = false;
    },
    { enableHighAccuracy: true }
  );
});

// Update regular report location display
function updateRegularLocationDisplay() {
  if (regularLocation) {
    const lat = regularLocation.latitude;
    const lon = regularLocation.longitude;
    regularLocationText.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    regularMapContainer.classList.remove('hidden');

    if (!regularMap) {
      regularMap = L.map('regular-map').setView([lat, lon], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(regularMap);

      regularMarker = L.marker([lat, lon], { draggable: true }).addTo(regularMap);

      regularMarker.on('dragend', function(e) {
        const pos = regularMarker.getLatLng();
        regularLocation = {
          latitude: pos.lat,
          longitude: pos.lng
        };
        regularLocationText.textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
      });
    } else {
      regularMap.setView([lat, lon], 17);
      regularMarker.setLatLng([lat, lon]);
    }

    setTimeout(() => regularMap.invalidateSize(), 100);
  }
}

// Create regular report
createRegularBtn.addEventListener('click', () => {
  const name = regularReportName.value.trim();
  if (!name) {
    showError('Please enter a name for this report');
    return;
  }

  if (!regularLocation) {
    showError('Please set a location');
    return;
  }

  regularReports.push({
    name: name,
    latitude: regularLocation.latitude,
    longitude: regularLocation.longitude,
    category: regularCategorySelect.value,
    description: regularDescriptionInput.value.trim()
  });

  saveRegularReports();

  // Clean up
  if (regularMap) {
    regularMap.remove();
    regularMap = null;
    regularMarker = null;
  }

  showStep('step-photo');
});

// Initialize on page load
loadSavedLocations();
loadRegularReports();
