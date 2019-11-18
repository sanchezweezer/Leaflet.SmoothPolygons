import L from 'leaflet';
import 'leaflet-geometryutil';
import paper from 'paper';
import { debounce } from './utils';

L.SmoothPolygonsLayer = (L.Layer ? L.Layer : L.Class).extend({
    addTo: function(map) {
        map.addLayer(this);
        return this;
    },

    paddingSize: 1,

    paths: [],

    _originPosition: { x: 0, y: 0 },

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

    addToScene: function(polygon, centralPoint, { onMouseEnter, onMouseLeave, onClick, onMouseMove, options = {} } = {}) {
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

        resultPath.translate({ x: this.paddingSize, y: this.paddingSize });
        // if (this.canvasOffset) resultPath.translate(this.canvasOffset);

        resultPath.fullySelected = false;

        resultPath._originalPolygon = { ...polygon };

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

        return resultPath;
    },

    _onMove: function(e) {
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

        map.on('move', debounce(this._onMove), this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', debounce(this._animateZoom), this);
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
        const scale = this._map.getZoomScale(e.zoom);

        const newPos = this._map._latLngToNewLayerPoint(
            this._map.containerPointToLatLng(paper.project.activeLayer.position),
            e.zoom,
            e.center
        );

        paper.project.activeLayer.scale(scale);
        paper.project.activeLayer.position = newPos.subtract(this.canvasOffset);
        this._originPosition = newPos;
    }
});

L.SmoothPolygonsLayer.getPolygonsBounds = function(polygons) {
    const _compound = new paper.CompoundPath({
        children: polygons.map((item) => item.path3)
    });
    const bounds = _compound.bounds.clone();
    _compound.remove();
    return bounds;
};

L.smoothPolygonsLayer = function(latlngs, options) {
    return new L.SmoothPolygonsLayer(latlngs, options);
};

export default L.SmoothPolygonsLayer;
