import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

import '../src/SmoothPoly';

import { data } from './config';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

//функция "замеса" цветов для создания прозрачных тонов, того же цвета
const hexToRGBA = (hex, alpha = false) => {
  let hexAlpha = false,
    h = hex.slice(hex.startsWith('#') ? 1 : 0);
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  else if (h.length === 8) hexAlpha = true;
  h = parseInt(h, 16);
  return (
    'rgb' +
    (alpha || hexAlpha ? 'a' : '') +
    '(' +
    (h >>> (hexAlpha ? 24 : 16)) +
    ', ' +
    ((h & (hexAlpha ? 0x00ff0000 : 0x00ff00)) >>> (hexAlpha ? 16 : 8)) +
    ', ' +
    ((h & (hexAlpha ? 0x0000ff00 : 0x0000ff)) >>> (hexAlpha ? 8 : 0)) +
    (alpha !== false ? `, ${alpha}` : '') +
    ')'
  );
};

const startZoom = 16;

const startPoint = { lat: 55.75, lng: 37.61 };

const mapOptions = {};
const tileOptions = {};

const flyToBtn = document.getElementById('flyTo');
const addPoly = document.getElementById('addPoly');
const reset = document.getElementById('reset');

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

const startFlyPoint = L.marker(startPoint).addTo(map);
const endFlyPoint = L.marker({ lat: 55.77, lng: 37.62 }).addTo(map);
const heat = L.smoothPolygonsLayer().addTo(map);

const addPolygon = () => {
  heat.clearAll();
  data[0].WindCm[0].polygons.forEach((polygon, index) => {
    heat.addToScene({
      polygon,
      centralPoint: startPoint,
      options: {
        onMouseLeave: (e, rest) => {
          // console.log('onMouseLeave', e, rest);
        },

        onClick: (e, rest) => {
          console.log('onClick', e, rest);
        },

        onMouseEnter: (e, rest) => {
          // console.log('onMouseEnter', e, rest);
        },

        onMouseMove: (e, rest) => {
          // console.log('onMouseMove', e, rest);
        },
        options: {
          fillColor: hexToRGBA('#07a2b9', 0.1 + 0.1 * index)
        }
      }
    });
  });
};

addPolygon();

let flyPoint = 'start';

flyToBtn.onclick = function() {
  map.flyTo(flyPoint === 'start' ? endFlyPoint.getLatLng() : startFlyPoint.getLatLng());
  flyPoint = flyPoint === 'start' ? 'end' : 'start';
};
