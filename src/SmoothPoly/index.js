import L from 'leaflet';
import 'leaflet-geometryutil';
import paper from 'paper';
import { debounce } from './utils';

const DEBOUNCE_TIME = 0;

const isNotProd = process.env.NODE_ENV !== 'production';

const debug = (text) => isNotProd && console.log(text);

L.SmoothPolygonsLayer = (L.Layer ? L.Layer : L.Class).extend({
  addTo: function(map) {
    map.addLayer(this);
    return this;
  },

  // canvas padding, so that there would be no clipping of polygons at the edges of the map when moving
  paddingSize: 128,

  // when to redraw polygons to get a new simplicized form
  redrawScale: 100,

  // storage of all polygons for redraw
  paths: [],

  // original position (no offset) of the base layer
  _originPosition: {},

  _subtractPadding(point) {
    return new paper.Point(point).subtract(this.paddingSize);
  },

  clearAll: function() {
    paper.project.clear();
  },

  clearAllPaths: function() {
    this.paths.splice(0);
  },

  getPolygonsCord: function(cords, center) {
    return cords
      .sort((a, b) => a.Direction - b.Direction)
      .map((item) => {
        const viewPoint = this._map.latLngToContainerPoint(
          L.GeometryUtil.destination(center, item.Direction - 90, item.Value)
        );
        return [viewPoint.x, viewPoint.y];
      });
  },

  _drawPolygon: function(polygon, centralPoint, pathOptions = {}) {
    const { onMouseEnter, onMouseLeave, onClick, onMouseMove, options = {} } = pathOptions;

    const polygonCoords = this.getPolygonsCord(polygon.data, centralPoint);

    // draw the outer contour
    const outerPath = new paper.Path({
      segments: polygonCoords,
      fillColor: 'rgba(0,0,0,.5)',
      closed: true,
      ...options
    });

    outerPath.smooth();

    outerPath.simplify();

    // cut out all the extraneous holes
    let resultPath = polygon.exclude.reduce((_result, item) => {
      return item.polygons.reduce((result, item) => {
        const excludePath = new paper.Path({
          segments: this.getPolygonsCord(item.data, centralPoint),
          closed: true
        });

        excludePath.smooth();

        excludePath.simplify();

        result = result.subtract(excludePath);

        excludePath.remove();

        return result;
      }, outerPath);
    }, outerPath);

    // remove the outer part
    outerPath.remove();

    // shift to canvas' padding
    resultPath.translate({ x: this.paddingSize, y: this.paddingSize });

    resultPath.fullySelected = false;

    resultPath.bringToFront();

    resultPath.onClick = (e) => {
      e.point = this._subtractPadding(e.point);
      onClick && onClick(e, { polygon: resultPath, layer: paper.project.activeLayer, context: this });
    };

    resultPath.onMouseEnter = (e) => {
      e.point = this._subtractPadding(e.point);
      onMouseEnter && onMouseEnter(e, { polygon: resultPath, layer: paper.project.activeLayer, context: this });
    };

    resultPath.onMouseMove = (e) => {
      e.point = this._subtractPadding(e.point);
      onMouseMove && onMouseMove(e, { polygon: resultPath, layer: paper.project.activeLayer, context: this });
    };

    resultPath.onMouseLeave = (e) => {
      e.point = this._subtractPadding(e.point);
      onMouseLeave && onMouseLeave(e, { polygon: resultPath, layer: paper.project.activeLayer, context: this });
    };

    this._originPosition = paper.project.activeLayer.position.clone().add(this.canvasOffset);

    return resultPath;
  },

  setDrawZoom: function() {
    this._lastDrawZoom = this._map.getZoom();
  },

  /**
   * the main function through which you can add polygons
   * @param polygon - polygon coords
   * @param centralPoint - center to polygon
   * @param pathOptions - styling adn interactive to polygon
   * @returns {path} - result polygon path
   */
  addToScene: function(polygon, centralPoint, pathOptions = {}) {
    this._originPosition = {};

    const resultPath = this._drawPolygon(polygon, centralPoint, pathOptions);

    this.setDrawZoom();

    const originalPolygon = (resultPath._originalPolygon = { polygon, centralPoint, pathOptions });

    this.paths.push(originalPolygon);

    return resultPath;
  },

  _redraw: function() {
    this.clearAll();
    this.paths.forEach(({ polygon, centralPoint, pathOptions }) => {
      return this._drawPolygon(polygon, centralPoint, pathOptions);
    });
    this.setDrawZoom();
  },

  _onFly: function({ event, parentEvent }) {
    debug(parentEvent + 'fly');
    const center = this._map.getCenter();
    const zoom = this._map.getZoom();

    const currentCenterPoint = this._map.project(this._oldCenter, zoom);
    const destCenterPoint = this._map.project(center, zoom);
    const centerOffset = destCenterPoint.subtract(currentCenterPoint);

    const topLeftOffset = centerOffset.multiplyBy(-1 * this._scale);

    paper.project.activeLayer.position = new paper.Point({
      x: this._originPosition.x + topLeftOffset.x,
      y: this._originPosition.y + topLeftOffset.y
    });

    this._oldCenter = this._map.getCenter();
  },

  _onMove: debounce(function(e) {
    debug('move');
    if (e.flyTo) return this._onFly({ event: e, parentEvent: 'move' });

    // getting CRS point 0,0 (zero point map layer)
    this.canvasOffset = this._map.containerPointToLayerPoint([0, 0]);

    // Canvas alignment relative to map offset
    L.DomUtil.setPosition(this._canvas, this.canvasOffset);

    this._onResize(e);

    // displacement of all polygons through the active layer
    // new paper.Path.Rectangle(paper.project.activeLayer.bounds);
    paper.project.activeLayer.position = new paper.Point({
      x: this._originPosition.x + -1 * this.canvasOffset.x,
      y: this._originPosition.y + -1 * this.canvasOffset.y
    });

    this._oldCenter = this._map.getCenter();
    debug('move end');
  }, DEBOUNCE_TIME),

  _onReset: function() {
    this._redraw();
  },

  _onResize: debounce(function() {
    let size = this._map.getSize();

    // if the card has resized, then setting the new canvas size
    if (this._canvas.width !== size.x + this.paddingSize * 2) {
      debug('resize x');
      this._canvas.width = size.x + this.paddingSize * 2;
      this._canvas.width = size.x + this.paddingSize * 2;
      this._canvas.style.width = size.x + this.paddingSize * 2 + 'px';
      paper.project.view.viewSize.width = size.x + this.paddingSize * 2;
    }
    if (this._canvas.height !== size.y + this.paddingSize * 2) {
      debug('resize y');
      this._canvas.height = size.y + this.paddingSize * 2;
      this._canvas.style.height = size.y + this.paddingSize * 2 + 'px';
      paper.project.view.viewSize.height = size.y + this.paddingSize * 2;
    }
  }, DEBOUNCE_TIME),

  onAdd: function(map) {
    this._map = map;

    if (!this._canvas) {
      this._initCanvas();
    }

    this._oldZoom = map.getZoom();
    this._oldCenter = map.getCenter();

    map.on('move', this._onMove, this);

    map.on('viewreset', this._onReset, this);

    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on('zoomanim zoom', this._animateZoom, this);
    }
  },

  onRemove: function(map) {
    map.getPanes().overlayPane.removeChild(this._canvas);

    map.off('move', this._onMove, this);

    map.off('viewreset', this._onReset, this);

    if (map.options.zoomAnimation) {
      map.off('zoomanim zoom', this._animateZoom, this);
    }
  },

  _initCanvas: function() {
    let canvas = (this._canvas = L.DomUtil.create('canvas', 'leaflet-smooth-polygon-layer leaflet-layer'));

    canvas.id = 'test';

    let originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
    canvas.style[originProp] = '50% 50%';

    let size = this._map.getSize();

    canvas.width = size.x + this.paddingSize * 2;
    canvas.height = size.y + this.paddingSize * 2;

    canvas.style.width = size.x + this.paddingSize * 2 + 'px';
    canvas.style.height = size.y + this.paddingSize * 2 + 'px';

    canvas.style.top = -1 * this.paddingSize + 'px';
    canvas.style.left = -1 * this.paddingSize + 'px';

    paper.setup(this._canvas);

    this._map._panes.overlayPane.appendChild(this._canvas);
  },

  _recalcZoom: function({ zoom, center, event, saveData = false } = {}) {
    this.zoomScale = this._map.getZoomScale(zoom, this._oldZoom);

    paper.project.activeLayer.scale(this.zoomScale);

    const newPos = this._map._latLngToNewLayerPoint(
      this._map.containerPointToLatLng(paper.project.activeLayer.position),
      zoom,
      center
    );

    const paddingTranslate = (1 - this.zoomScale) * this.paddingSize;

    debug(
      `!? scale: ${this.zoomScale}, padding: ${paddingTranslate}, newPos: ${newPos}, center: ${center}, ${this.canvasOffset}`
    );

    const newOriginPosition = newPos.add({ x: paddingTranslate, y: paddingTranslate });

    paper.project.activeLayer.position = newOriginPosition.subtract(this.canvasOffset || [0, 0]);

    if (saveData) {
      this._oldZoom = zoom;
      this._originPosition = newOriginPosition;
    }
  },

  _animateZoom: debounce(function(e) {
    const zoom = e.zoom || this._map.getZoom();
    const center = e.center || this._map.getCenter();

    debug(`zoom, old:${this._oldZoom} zoom:${zoom}`);

    // data for flyTo mode

    if (e.flyTo) {
      // save scale to compute
      this._scale = this.zoomScale;

      // call flyTo handle
      // return this._onFly({ event: e, parentEvent: 'zoom' });
    } else {
      // save old center
      this._oldCenter = center;

      debug(`zoom end, old:${this._oldZoom} zoom:${zoom}`);

      // turn off zoom handle if not in flyTo
      if (e.type === 'zoom') {
        return;
      }
    }

    // needed calcs
    this._recalcZoom({ zoom, center, event: e, saveData: true });

    // needed to redraw polygons with not right coordinates after simplify
    if (Math.abs(this._lastDrawZoom - zoom) > this.redrawScale) {
      debug('redraw');

      this._redraw();

      // set to right position
      this._recalcZoom({ zoom, center, event: e });
    }

    debug(`zoom end, old:${this._oldZoom} zoom:${zoom}`);
  }, DEBOUNCE_TIME)
});

L.SmoothPolygonsLayer.getPolygonsBounds = function() {
  return paper.project.activeLayer.bounds.clone();
};

L.smoothPolygonsLayer = function(latlngs, options) {
  return new L.SmoothPolygonsLayer(latlngs, options);
};

export default L.SmoothPolygonsLayer;
