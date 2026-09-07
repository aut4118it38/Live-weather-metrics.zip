/**
 * ATMOSPHERICS — Live Weather Dashboard
 * Async JavaScript + RESTful API Integration
 *
 * APIs Used:
 *   - Nominatim (OpenStreetMap): Geocoding city name → lat/lon (free, no key)
 *   - Open-Meteo: Weather data from lat/lon (free, no key)
 */

'use strict';

// ─────────────────────────────────────────────
// API ENDPOINTS
// ─────────────────────────────────────────────
const GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  unit: 'C',
  rawTemp: null,
  rawFeels: null,
  rawDew: null,
  rawTempMin: null,
  rawTempMax: null,
  recentSearches: JSON.parse(localStorage.getItem('atm_recent') || '[]'),
  lastCity: '',
};

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
  cityInput:        $('cityInput'),
  searchBtn:        $('searchBtn'),
  searchError:      $('searchError'),
  errorMsg:         $('errorMsg'),
  loadingState:     $('loadingState'),
  dashboard:        $('dashboard'),
  emptyState:       $('emptyState'),
  skyBackdrop:      $('skyBackdrop'),
  recentSearches:   $('recentSearches'),
  recentTags:       $('recentTags'),

  // Location
  cityName:         $('cityName'),
  locationSub:      $('locationSub'),
  lastUpdated:      $('lastUpdated'),
  coordsDisplay:    $('coordsDisplay'),

  // Temperature
  tempValue:        $('tempValue'),
  tempCondition:    $('tempCondition'),
  tempRange:        $('tempRange'),
  conditionIcon:    $('conditionIcon'),
  feelsLike:        $('feelsLike'),
  visibility:       $('visibility'),
  uvIndex:          $('uvIndex'),
  cloudCover:       $('cloudCover'),

  // Cards
  humidity:         $('humidity'),
  humidityGauge:    $('humidityGauge'),
  windSpeed:        $('windSpeed'),
  windDirection:    $('windDirection'),
  compassNeedle:    $('compassNeedle'),
  pressure:         $('pressure'),
  pressureTrend:    $('pressureTrend'),
  pressureArc:      $('pressureArc'),
  pressureArcLabel: $('pressureArcLabel'),
  sunrise:          $('sunrise'),
  sunset:           $('sunset'),
  dayLength:        $('dayLength'),
  sunPosition:      $('sunPosition'),
  precipitation:    $('precipitation'),
  dewPoint:         $('dewPoint'),
  dewComfort:       $('dewComfort'),
  comfortIndicator: $('comfortIndicator'),

  // Unit buttons
  btnC:             $('btnC'),
  btnF:             $('btnF'),
};

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Convert Celsius to Fahrenheit
 */
const toF = (c) => Math.round(c * 9 / 5 + 32);

/**
 * Format temperature based on current unit
 */
const fmtTemp = (c) => {
  if (c === null || c === undefined) return '—';
  return state.unit === 'C' ? `${Math.round(c)}°C` : `${toF(c)}°F`;
};

/**
 * Format temperature value only (no unit, for display)
 */
const fmtTempVal = (c) => {
  if (c === null || c === undefined) return '—';
  return state.unit === 'C' ? Math.round(c) : toF(c);
};

/**
 * Convert degrees to compass direction
 */
const degToCompass = (deg) => {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

/**
 * Format unix timestamp to HH:MM
 */
const fmtTime = (isoString) => {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * WMO weather code → emoji + label
 */
const WMO_CODES = {
  0: ['☀️', 'Clear Sky'],
  1: ['🌤️', 'Mainly Clear'],
  2: ['⛅', 'Partly Cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Foggy'],
  48: ['🌫️', 'Depositing Rime Fog'],
  51: ['🌦️', 'Light Drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌧️', 'Heavy Drizzle'],
  61: ['🌧️', 'Slight Rain'],
  63: ['🌧️', 'Moderate Rain'],
  65: ['🌧️', 'Heavy Rain'],
  71: ['🌨️', 'Slight Snow'],
  73: ['❄️', 'Moderate Snow'],
  75: ['❄️', 'Heavy Snow'],
  77: ['🌨️', 'Snow Grains'],
  80: ['🌦️', 'Slight Showers'],
  81: ['🌧️', 'Moderate Showers'],
  82: ['⛈️', 'Violent Showers'],
  85: ['🌨️', 'Snow Showers'],
  86: ['❄️', 'Heavy Snow Showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm w/ Hail'],
  99: ['⛈️', 'Thunderstorm w/ Heavy Hail'],
};

const getCondition = (code) => WMO_CODES[code] || ['🌡️', 'Unknown'];

/**
 * Sleep for animations
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────
// API FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Geocode city name to lat/lon using Nominatim
 * @param {string} cityName
 * @returns {Promise<{lat: number, lon: number, displayName: string, country: string}>}
 */
async function geocodeCity(cityName) {
  const params = new URLSearchParams({
    q: cityName,
    format: 'json',
    limit: 1,
    addressdetails: 1,
  });

  const response = await fetch(`${GEOCODE_URL}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'AtmosphericsWeatherDashboard/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error('CITY_NOT_FOUND');
  }

  const result = data[0];
  const addr = result.address || {};

  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: addr.city || addr.town || addr.village || addr.county || result.display_name.split(',')[0],
    country: addr.country || '',
    state: addr.state || '',
  };
}

/**
 * Fetch weather data from Open-Meteo
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Object>} - Full weather JSON
 */
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'surface_pressure',
      'visibility',
      'dew_point_2m',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'uv_index_max',
    ].join(','),
    timezone: 'auto',
  });

  const response = await fetch(`${WEATHER_URL}?${params}`);

  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.current) {
    throw new Error('WEATHER_PARSE_ERROR');
  }

  return data;
}

// ─────────────────────────────────────────────
// UI STATE MANAGEMENT
// ─────────────────────────────────────────────

function showLoading() {
  els.loadingState.classList.remove('hidden');
  els.dashboard.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.searchError.classList.add('hidden');
}

function showDashboard() {
  els.loadingState.classList.add('hidden');
  els.dashboard.classList.remove('hidden');
  els.emptyState.classList.add('hidden');
}

function showEmpty() {
  els.loadingState.classList.add('hidden');
  els.dashboard.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
}

function showError(msg) {
  els.searchError.classList.remove('hidden');
  els.errorMsg.textContent = msg;
  els.loadingState.classList.add('hidden');
}

// ─────────────────────────────────────────────
// SKY BACKDROP
// ─────────────────────────────────────────────

function updateSkyBackdrop(temp, wmoCode) {
  const bd = els.skyBackdrop;
  bd.classList.remove('sky-warm', 'sky-cold', 'sky-storm');

  if ([95, 96, 99, 80, 81, 82].includes(wmoCode)) {
    bd.classList.add('sky-storm');
  } else if (temp > 25) {
    bd.classList.add('sky-warm');
  } else if (temp < 5) {
    bd.classList.add('sky-cold');
  }
}

// ─────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────

function renderTemperature() {
  els.tempValue.textContent = fmtTempVal(state.rawTemp);
  if (state.rawFeels !== null) els.feelsLike.textContent = fmtTemp(state.rawFeels);
  if (state.rawDew !== null) {
    els.dewPoint.textContent = fmtTemp(state.rawDew);
    updateDewComfort(state.rawDew);
  }
  if (state.rawTempMin !== null && state.rawTempMax !== null) {
    const lo = fmtTemp(state.rawTempMin);
    const hi = fmtTemp(state.rawTempMax);
    els.tempRange.textContent = `↓ ${lo} · ↑ ${hi}`;
  }
}

function updateDewComfort(dewC) {
  let label, pos;
  if (dewC < 10) { label = 'Very dry'; pos = 10; }
  else if (dewC < 16) { label = 'Comfortable'; pos = 35; }
  else if (dewC < 21) { label = 'Humid'; pos = 60; }
  else { label = 'Very humid'; pos = 85; }

  els.dewComfort.textContent = label;
  els.comfortIndicator.style.left = `${pos}%`;
}

function renderWeather(weather, geoInfo) {
  const cur = weather.current;
  const daily = weather.daily;
  const wmoCode = cur.weather_code;
  const [icon, condition] = getCondition(wmoCode);

  // Store raw values in state
  state.rawTemp = cur.temperature_2m;
  state.rawFeels = cur.apparent_temperature;
  state.rawDew = cur.dew_point_2m;
  state.rawTempMin = daily.temperature_2m_min[0];
  state.rawTempMax = daily.temperature_2m_max[0];

  // Location
  els.cityName.textContent = geoInfo.displayName;
  els.locationSub.textContent = [geoInfo.state, geoInfo.country].filter(Boolean).join(', ');
  els.lastUpdated.textContent = `UPDATED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  els.coordsDisplay.textContent = `${geoInfo.lat.toFixed(4)}°N, ${geoInfo.lon.toFixed(4)}°E`;

  // Temperature + condition
  els.conditionIcon.textContent = icon;
  els.tempCondition.textContent = condition.toUpperCase();
  renderTemperature();

  // Atmosphere bar
  const visKm = cur.visibility ? `${(cur.visibility / 1000).toFixed(1)} km` : '—';
  els.visibility.textContent = visKm;
  els.uvIndex.textContent = daily.uv_index_max?.[0] ?? '—';
  els.cloudCover.textContent = `${cur.cloud_cover}%`;

  // Humidity card
  els.humidity.textContent = `${cur.relative_humidity_2m}%`;
  els.humidityGauge.style.width = `${cur.relative_humidity_2m}%`;

  // Wind card
  const windKph = Math.round(cur.wind_speed_10m);
  els.windSpeed.textContent = `${windKph} km/h`;
  const dir = degToCompass(cur.wind_direction_10m);
  els.windDirection.textContent = `${dir} · Gusts ${Math.round(cur.wind_gusts_10m)} km/h`;

  // Rotate compass needle (offset by 180 so needle points in wind direction FROM)
  const needleAngle = cur.wind_direction_10m - 180;
  els.compassNeedle.style.transform = `translate(-50%, -100%) rotate(${needleAngle}deg)`;

  // Pressure card
  const hPa = Math.round(cur.surface_pressure);
  els.pressure.textContent = `${hPa} hPa`;
  const pressLabel = hPa > 1013 ? 'HIGH — Stable' : hPa < 1000 ? 'LOW — Unsettled' : 'NORMAL';
  els.pressureTrend.textContent = pressLabel;
  els.pressureArcLabel.textContent = pressLabel.split(' — ')[0];

  // Pressure arc: map 950–1050 hPa to 0–126 (dashoffset)
  const pct = Math.min(1, Math.max(0, (hPa - 950) / 100));
  els.pressureArc.style.strokeDashoffset = 126 - (126 * pct);

  // Sun card
  const riseTime = fmtTime(daily.sunrise[0]);
  const setTime = fmtTime(daily.sunset[0]);
  els.sunrise.textContent = riseTime;
  els.sunset.textContent = setTime;

  const riseMs = new Date(daily.sunrise[0]).getTime();
  const setMs = new Date(daily.sunset[0]).getTime();
  const nowMs = Date.now();
  const dayLen = Math.round((setMs - riseMs) / 3600000 * 10) / 10;
  els.dayLength.textContent = `Day length: ${dayLen}h`;

  // Sun position
  const sunPct = Math.min(100, Math.max(0, ((nowMs - riseMs) / (setMs - riseMs)) * 100));
  els.sunPosition.style.left = `${sunPct}%`;

  // Precipitation
  const precip = cur.precipitation;
  els.precipitation.textContent = `${precip.toFixed(1)} mm`;
  animateRainBars(precip);

  // Sky backdrop
  updateSkyBackdrop(cur.temperature_2m, wmoCode);
}

/**
 * Animate random-looking rain bars based on precipitation value
 */
function animateRainBars(precipMm) {
  const bars = document.querySelectorAll('.rain-bar');
  bars.forEach((bar, i) => {
    const h = Math.max(8, Math.min(100, (precipMm * 40) + Math.random() * 30));
    bar.style.height = `${h}%`;
    bar.style.background = precipMm > 0 ? 'var(--cyan)' : 'var(--border)';
    bar.style.opacity = 0.4 + (i / bars.length) * 0.6;
  });
}

// ─────────────────────────────────────────────
// SEARCH FLOW
// ─────────────────────────────────────────────

async function handleSearch() {
  const query = els.cityInput.value.trim();
  if (!query) {
    els.cityInput.focus();
    return;
  }

  showLoading();

  try {
    // Step 1: Geocode
    const geoInfo = await geocodeCity(query);

    // Step 2: Fetch weather
    const weatherData = await fetchWeather(geoInfo.lat, geoInfo.lon);

    // Step 3: Render
    renderWeather(weatherData, geoInfo);
    showDashboard();

    // Step 4: Save to recent
    addRecentSearch(geoInfo.displayName);
    state.lastCity = geoInfo.displayName;

  } catch (err) {
    console.error('[Atmospherics Error]', err);

    if (err.message === 'CITY_NOT_FOUND') {
      showError(`"${query}" wasn't found. Try a different city name.`);
    } else if (err.message.includes('NetworkError') || err.name === 'TypeError') {
      showError('Network error — check your connection and try again.');
    } else if (err.message === 'WEATHER_PARSE_ERROR') {
      showError('Weather data could not be parsed. Please try again.');
    } else {
      showError('Something went wrong. Please try again.');
    }

    // If dashboard was previously showing, keep it; else show empty
    if (els.dashboard.classList.contains('hidden')) {
      showEmpty();
      els.searchError.classList.remove('hidden');
    }
  }
}

// ─────────────────────────────────────────────
// RECENT SEARCHES
// ─────────────────────────────────────────────

function addRecentSearch(cityName) {
  state.recentSearches = [cityName, ...state.recentSearches.filter(c => c !== cityName)].slice(0, 5);
  localStorage.setItem('atm_recent', JSON.stringify(state.recentSearches));
  renderRecentSearches();
}

function renderRecentSearches() {
  if (state.recentSearches.length === 0) {
    els.recentSearches.classList.add('hidden');
    return;
  }

  els.recentSearches.classList.remove('hidden');
  els.recentTags.innerHTML = '';

  state.recentSearches.forEach(city => {
    const tag = document.createElement('button');
    tag.className = 'recent-tag';
    tag.textContent = city;
    tag.addEventListener('click', () => {
      els.cityInput.value = city;
      handleSearch();
    });
    els.recentTags.appendChild(tag);
  });
}

// ─────────────────────────────────────────────
// UNIT TOGGLE
// ─────────────────────────────────────────────

function setUnit(unit) {
  state.unit = unit;
  els.btnC.classList.toggle('active', unit === 'C');
  els.btnF.classList.toggle('active', unit === 'F');

  if (state.rawTemp !== null) {
    renderTemperature();
  }
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────

els.searchBtn.addEventListener('click', handleSearch);

els.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearch();
});

els.cityInput.addEventListener('input', () => {
  els.searchError.classList.add('hidden');
});

els.btnC.addEventListener('click', () => setUnit('C'));
els.btnF.addEventListener('click', () => setUnit('F'));

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

function init() {
  renderRecentSearches();

  // If there's a last search saved, auto-load it
  const last = state.recentSearches[0];
  if (last) {
    els.cityInput.value = last;
    handleSearch();
  } else {
    showEmpty();
  }
}

init();
