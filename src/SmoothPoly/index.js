import L from 'leaflet';
import 'leaflet-geometryutil';
import paper from 'paper';
import { debounce } from './utils';

const DEBOUNCE_TIME = 0;

const isNotProd = process.env.NODE_ENV !== 'production';

const debug = (text) => isNotProd && console.log(text);

L.SmoothPolygonsLayer = (L.Layer ? L.Layer : L.Class).extend({
  // Number of pixel which defines offset of map when to redraw polygons
  redrawScale: 300,

  // Canvas padding, so that there would be no clipping of polygons at the edges of the map when moving
  paddingSize: 128,

  // Storage of all polygons for redraw
  paths: [],

  // Original position ({ x: pixels, y: pixels }) (without offset) of the base layer
  _originPosition: {},

  // Control point: central Point(<LatLng> latlng) of the first drawn polygon. Needed to calculate shift of canvas.
  _position: {},

  /**
   * Adds the layer to the given {@param map} or layer group.
   * @param map: L.Map which contains layer
   * @returns {L.SmoothPolygonsLayer} layer
   */
  addTo: function(map) {
    map.addLayer(this);
    return this;
  },

  /**
   * Adds {@param polygon} to {@code this.paths} property and draws it
   * @param polygon: polygon's coordinates
   * @param centralPoint: central point of the polygon
   * @param pathOptions: styles and interactivity of the polygon
   * @returns {Paper.CompoundPath}: path of polygon
   */
  addToScene: function(polygon, centralPoint, pathOptions = {}) {
    this._originPosition = {};

    this._setDrawZoom();

    const resultPath = this._drawPolygon(polygon, centralPoint, pathOptions);

    const originalPolygon = (resultPath._originalPolygon = { polygon, centralPoint, pathOptions });
    this.paths.push(originalPolygon);

    return resultPath;
  },

  /**
   * Clears paper's layer
   */
  clearAll: function() {
    paper.project.clear();
  },

  /**
   * Clears {@code this.paths}
   */
  clearAllPaths: function() {
    this._position = {};
    this.paths.splice(0);
  },

  /**
   * Maps polygon data taken from API data to correct format ([x, y])
   * @param coords: array of polygon coordinates in API format ({ Direction, Value })
   * @param center: central point of the polygon
   * @returns array of coordinates in format [x, y]
   */
  getPolygonsCord: function(coords, center) {
    return coords
      .sort((a, b) => a.Direction - b.Direction)
      .map((item) => {
        const viewPoint = this._map.latLngToContainerPoint(
          L.GeometryUtil.destination(center, item.Direction - 90, item.Value)
        );
        return [viewPoint.x, viewPoint.y];
      });
  },

  /**
   * Creates DOM elements for the layer,
   *  adds them to map panes where they should belong and puts listeners on relevant map events.
   * @param map: L.Map which contains layer
   */
  onAdd: function(map) {
    this._map = map;

    if (!this._canvas) {
      this._initCanvas();
    }

    this._oldZoom = map.getZoom();

    map.on('move', this._onMove, this);

    map.on('viewreset', this._onReset, this);

    map.on('resize', this._onResize, this);

    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on('zoomanim zoom', this._animateZoom, this);
    }
  },

  /**
   * Removes the layer's elements from the DOM and removes listeners previously added in {@code onAdd}.
   * @param map: L.Map which contains layer
   */
  onRemove: function(map) {
    map.getPanes().overlayPane.removeChild(this._canvas);

    map.off('move', this._onMove, this);

    map.off('viewreset', this._onReset, this);

    map.off('resize', this._onResize, this);

    if (map.options.zoomAnimation) {
      map.off('zoomanim zoom', this._animateZoom, this);
    }
  },

  /**
   * Handles zoom animation event. Wrapped with {@code debounce()} function.
   * @private
   */
  _animateZoom: debounce(function(e) {
    const zoom = e.zoom || this._map.getZoom();
    const center = e.center || this._map.getCenter();

    debug(`zoom, old:${this._oldZoom} zoom:${zoom}`);

    // Calculates and sets zoom and position
    this._recalcZoom({ zoom, center, event: e, saveData: true });

    // Check real position of polygons after simplification. Redraw polygons if position is incorrect.
    if (Math.abs(this._lastDrawZoom - zoom) > this.redrawScale) {
      debug('redraw');

      this._redraw();

      // Calculates and sets zoom and position
      this._recalcZoom({ zoom, center, event: e });
    }

    debug(`zoom end, old:${this._oldZoom} zoom:${zoom}`);
  }, DEBOUNCE_TIME),

  /**
   * Draws polygon and adds event listeners.
   * @param polygon: polygon object from API in format { data: coordinates[], exclude: coordinates[], value: number}
   * @param centralPoint: central point of the polygon
   * @param pathOptions: styles and interactivity of the polygon
   * @returns {Paper.CompoundPath}: path of polygon
   * @private
   */
  _drawPolygon: function(polygon, centralPoint, pathOptions = {}) {
    const { onMouseEnter, onMouseLeave, onClick, onMouseMove, options = {} } = pathOptions;

    const polygonCoords = this.getPolygonsCord(polygon.data, centralPoint);

    // Draws the outer contour
    const outerPath = new paper.Path({
      segments: polygonCoords,
      fillColor: 'rgba(0,0,0,.5)',
      closed: true,
      ...options
    });

    outerPath.smooth();

    outerPath.simplify();

    // Cuts off all useless areas
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
    resultPath.translate(this._getPaddingOffsetObject());

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

    // Inits position of the control point (LatLng).
    this._position = this._map.unproject(
      this._map
        .getPixelOrigin()
        .add(this._originPosition)
        .subtract(this._getPaddingOffsetObject())
    );

    return resultPath;
  },

  /**
   * Returns padding offset as object
   * @returns {{x: number, y: number}}
   * @private
   */
  _getPaddingOffsetObject: function() {
    return { x: this.paddingSize, y: this.paddingSize };
  },

  /**
   * Calculates Viewport size, including padding
   * @returns {{width: number, height: number}}
   * @private
   */
  _getViewportSize: function() {
    const mapSize = this._map.getSize();

    return {
      width: mapSize.x + this.paddingSize * 2,
      height: mapSize.y + this.paddingSize * 2
    };
  },

  /**
   * Initializes canvas which contains polygons. Sets its sizes and styles. Adds it to the paper.
   * @private
   */
  _initCanvas: function() {
    let canvas = (this._canvas = L.DomUtil.create('canvas', 'leaflet-smooth-polygon-test-layer leaflet-layer'));

    canvas.id = 'mfPolygonsCanvas';

    let originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
    canvas.style[originProp] = '50% 50%';

    const size = this._getViewportSize();

    canvas.width = size.width;
    canvas.height = size.height;

    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    canvas.style.top = -this.paddingSize + 'px';
    canvas.style.left = -this.paddingSize + 'px';

    paper.setup(this._canvas);

    this._map._panes.overlayPane.appendChild(this._canvas);
  },

  /**
   * Handles onFly events. Then calculates new position of the paper and applies it.
   * @param event
   * @param parentEvent event that triggered current event
   * @private
   */
  _onFly: function({ event, parentEvent }) {
    debug(parentEvent + 'fly');

    // Prevents if position is empty. In fact, if no one polygon had been drawn.
    if (!(this._position.lat && this._position.lng)) return;

    // Calculates new position of the paper
    const newOriginPosition = this._map
      .project(this._position)
      .subtract(this._map.getPixelOrigin())
      .add(this._getPaddingOffsetObject());

    // Sets new position of the paper.
    paper.project.activeLayer.position = new paper.Point(
      newOriginPosition.subtract({ x: this.canvasOffset, y: this.canvasOffset })
    );
    this._originPosition = newOriginPosition;
  },

  /**
   * Handles onMove events wrapped by debounce function. Sets new canvas offset if event's type is 'move'.
   * If event's type is 'fly', calls _onFly handler.
   * @private
   */
  _onMove: debounce(function(e) {
    debug('move');
    if (e.flyTo) this._onFly({ event: e, parentEvent: 'move' });

    /* Given a pixel coordinate relative to the map container,
          returns the corresponding pixel coordinate relative to the origin pixel.
         */
    this.canvasOffset = this._map.containerPointToLayerPoint([0, 0]);

    // Sets the position of canvas to canvasOffset value.
    L.DomUtil.setPosition(this._canvas, this.canvasOffset);

    // Sets new position of the paper.
    paper.project.activeLayer.position = new paper.Point({
      x: this._originPosition.x - this.canvasOffset.x,
      y: this._originPosition.y - this.canvasOffset.y
    });
    debug('move end');
  }, DEBOUNCE_TIME),

  /**
   * Handles 'viewreset' events.
   * @private
   */
  _onReset: function() {
    this._redraw();
  },

  /**
   * Handles onResize events wrapped by debounce function. Calculates new sizes of the paper and applies them.
   */
  _onResize: debounce(function() {
    const newSize = this._getViewportSize();

    // if the card has resized, then setting the new canvas size
    if (this._canvas.width !== newSize.width) {
      debug('resize x');
      paper.project.view.viewSize.width = newSize.width;
    }

    if (this._canvas.height !== newSize.height) {
      debug('resize y');
      paper.project.view.viewSize.height = newSize.height;
    }
  }, DEBOUNCE_TIME),

  /**
   * Calculates new zoom and position of the paper.
   * @param zoom current map zoom
   * @param center current coordinates of the map center
   * @param event
   * @param saveData: boolean if true then update {@code this._oldZoom} and {@code this._originPosition}.
   * @private
   */
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

  /**
   * Clears paper and then draws all polygons.
   * @private
   */
  _redraw: function() {
    this.clearAll();
    this.paths.forEach(({ polygon, centralPoint, pathOptions }) => {
      return this._drawPolygon(polygon, centralPoint, pathOptions);
    });
    this._setDrawZoom();
  },

  /**
   * Saves current map zoom to the {@code this._lastDrawZoom}
   */
  _setDrawZoom: function() {
    this._lastDrawZoom = this._map.getZoom();
  },

  /**
   * Returns new paper position including {@code this.paddingSize}
   * @param point current point
   * @returns {paper.Point} point included padding offset
   * @private
   */
  _subtractPadding(point) {
    return new paper.Point(point).subtract(this.paddingSize);
  }
});

/**
 * Implementation of getPolygonsBounds
 * @returns {paper.Rectangle}
 */
L.SmoothPolygonsLayer.getPolygonsBounds = function() {
  return paper.project.activeLayer.bounds.clone();
};

/**
 * Adds smooth polygons to the leaflet
 */
L.smoothPolygonsLayer = function(latlngs, options) {
  return new L.SmoothPolygonsLayer(latlngs, options);
};

export default L.SmoothPolygonsLayer;
