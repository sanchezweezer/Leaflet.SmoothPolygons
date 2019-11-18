import L from 'leaflet';

import '../src/SmoothPoly';

import 'leaflet/dist/leaflet.css';

import data from './config';

const startZoom = 16;

const startPoint = { lat: 55.75, lng: 37.61 };

const mapOptions = {};
const tileOptions = {};

const map = L.map('map', {
    zoomControl: false,
    ...mapOptions
}).setView(startPoint, startZoom);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
    attribution:
        'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
    id: 'CartoDB.VoyagerLabelsUnder',
    ...tileOptions
})
    .on('tileerror', (e) => {
        console.error('Tile not load:', e);
    })
    .addTo(map);

const heat = L.smoothPolygonsLayer().addTo(map);
