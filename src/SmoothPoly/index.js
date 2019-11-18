import L from 'leaflet';
import 'leaflet-geometryutil';
import paper from 'paper';
import { debounce } from './utils';

L.SmoothPolygonsLayer = (L.Layer ? L.Layer : L.Class).extend({
    addTo: function(map) {
        map.addLayer(this);
        return this;
    },

    paddingSize: 128,

    redrawScale: 3,

    paths: [],

    _originPosition: {},

    subtractPadding(point) {
        return new paper.Point(point).subtract(this.paddingSize);
    },

    clearAll: function() {
        paper.project.clear();
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

        const outerPath = new paper.Path({
            segments: polygonCoords,
            fillColor: 'rgba(0,0,0,.5)',
            closed: true,
            ...options
        });

        outerPath.smooth();

        outerPath.simplify();

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

        outerPath.remove();

        // resultPath.scale(1 / mapScale);

        resultPath.translate({ x: this.paddingSize, y: this.paddingSize });

        resultPath.fullySelected = false;

        resultPath.bringToFront();

        resultPath._onClick = (e) => {
            e.point = this.subtractPadding(e.point);
            onClick && onClick(e, { polygon: resultPath, layer: this });
        };

        resultPath.onMouseEnter = (e) => {
            e.point = this.subtractPadding(e.point);
            onMouseEnter && onMouseEnter(e, { polygon: resultPath, layer: this });
        };

        resultPath.onMouseMove = (e) => {
            e.point = this.subtractPadding(e.point);
            onMouseMove && onMouseMove(e, { polygon: resultPath, layer: this });
        };

        resultPath.onMouseLeave = (e) => {
            e.point = this.subtractPadding(e.point);
            onMouseLeave && onMouseLeave(e, { polygon: resultPath, layer: this });
        };

        this._originPosition = paper.project.activeLayer.position.clone().add(this.canvasOffset);

        this._lastDrawZoom = this._map.getZoom();

        return resultPath;
    },

    addToScene: function(polygon, centralPoint, pathOptions = {}) {
        this._originPosition = {};

        const resultPath = this._drawPolygon(polygon, centralPoint, pathOptions);

        const originalPolygon = (resultPath._originalPolygon = { polygon, centralPoint, pathOptions });

        this.paths.push(originalPolygon);

        return resultPath;
    },

    _redraw: function() {
        this.clearAll();
        this.paths.forEach(({ polygon, centralPoint, pathOptions }) => {
            console.log({ polygon, centralPoint, pathOptions });
            return this._drawPolygon(polygon, centralPoint, pathOptions);
        });
    },

    _onFly: function() {
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

    _onMove: function(e) {
        if (e.flyTo) return this._onFly(e);

        //получение точки CRS 0,0 (нулевой точки слоя карты)
        this.canvasOffset = this._map.containerPointToLayerPoint([0, 0]);

        //выравнивание канваса относительно смещения карты
        L.DomUtil.setPosition(this._canvas, this.canvasOffset);

        this._onResize(e);

        // смещение всех полигонов через активный слой
        // new paper.Path.Rectangle(paper.project.activeLayer.bounds);
        paper.project.activeLayer.position = new paper.Point({
            x: this._originPosition.x + -1 * this.canvasOffset.x,
            y: this._originPosition.y + -1 * this.canvasOffset.y
        });

        this._oldCenter = this._map.getCenter();
    },

    _onReset: function(e) {
        console.log('reset', e);
    },

    _onResize: function(e) {
        let size = this._map.getSize();

        //если карта изменила размеры, то выставление новых размеров канваса
        if (this._canvas.width !== size.x + this.paddingSize * 2) {
            this._canvas.width = size.x + this.paddingSize * 2;
            this._canvas.width = size.x + this.paddingSize * 2;
            this._canvas.style.width = size.x + this.paddingSize * 2 + 'px';
            paper.project.view.viewSize.width = size.x + this.paddingSize * 2;
        }
        if (this._canvas.height !== size.y + this.paddingSize * 2) {
            this._canvas.height = size.y + this.paddingSize * 2;
            this._canvas.style.height = size.y + this.paddingSize * 2 + 'px';
            paper.project.view.viewSize.height = size.y + this.paddingSize * 2;
        }
    },

    onAdd: function(map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        this._oldZoom = map.getZoom();
        this._oldCenter = map.getCenter();

        map.on('move', debounce(this._onMove), this);

        map.on('viewreset', debounce(this._onReset), this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim zoom', debounce(this._animateZoom), this);
        }
    },

    onRemove: function(map) {
        map.getPanes().overlayPane.removeChild(this._canvas);

        map.off('move', debounce(this._onMove), this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', debounce(this._animateZoom), this);
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

    _animateZoom: function(e) {
        const zoom = e.zoom || this._map.getZoom();
        const center = e.center || this._map.getCenter();

        const scale = this._map.getZoomScale(zoom, this._oldZoom);

        const newPos = this._map._latLngToNewLayerPoint(
            this._map.containerPointToLatLng(paper.project.activeLayer.position),
            zoom,
            center
        );

        if (e.flyTo) {
            this._scale = scale;
        }

        paper.project.activeLayer.scale(scale);
        paper.project.activeLayer.position = newPos.subtract(this.canvasOffset || [0, 0]);

        const paddingTranslate = scale > 1 ? -1 * this.paddingSize : scale * this.paddingSize;

        paper.project.activeLayer.translate({ x: paddingTranslate, y: paddingTranslate });

        this._oldZoom = zoom;
        this._originPosition = newPos;

        if (!e.flyTo) {
            this._oldCenter = center;
        }

        if (Math.abs(this._lastDrawZoom - zoom) > this.redrawScale) {
            this._redraw();
            const newPos = this._map._latLngToNewLayerPoint(
                this._map.containerPointToLatLng(paper.project.activeLayer.position),
                zoom,
                center
            );
            paper.project.activeLayer.scale(scale);
            paper.project.activeLayer.position = newPos.subtract(this.canvasOffset || [0, 0]);
            paper.project.activeLayer.translate({ x: paddingTranslate, y: paddingTranslate });
        }
    }
});

L.SmoothPolygonsLayer.getPolygonsBounds = function(polygons) {
    return paper.project.activeLayer.bounds.clone();
};

L.smoothPolygonsLayer = function(latlngs, options) {
    return new L.SmoothPolygonsLayer(latlngs, options);
};

export default L.SmoothPolygonsLayer;
