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

        this._originPosition = paper.project.activeLayer.position.clone();

        return resultPath;
    },

    _onMove: function(e) {
        //получение точки CRS 0,0 (нулевой точки слоя карты)
        let topLeft = this._map.containerPointToLayerPoint([0, 0]);

        // debug circle
        // if (!this.count) this.count = 0;
        // L.circle(this._map.containerPointToLatLng([100, 100]), { radius: 200 })
        //     .addTo(this._map)
        //     .bindTooltip(this.count.toString());
        // this.count++;

        //выравнивание канваса относительно смещения карты
        L.DomUtil.setPosition(this._canvas, topLeft);

        this._onResize(e);

        // смещение всех полигонов через активный слой
        new paper.Path.Rectangle(paper.project.activeLayer.bounds);
        paper.project.activeLayer.position = new paper.Point({
            x: this._originPosition.x + -1 * topLeft.x,
            y: this._originPosition.y + -1 * topLeft.y
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
        // map.on('resize', debounce(this._onResize, 800), this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', debounce(this._animateZoom), this);
        }
    },

    onRemove: function(map) {
        map.getPanes().overlayPane.removeChild(this._canvas);

        map.off('move', debounce(this._onMove), this);
        // map.on('resize', debounce(this._onResize), this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', debounce(this._animateZoom), this);
        }
    },

    _initCanvas: function() {
        let canvas = (this._canvas = L.DomUtil.create('canvas', 'leaflet-smooth-polygon-layer leaflet-layer'));

        canvas.id = 'test';

        let originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
        canvas.style[originProp] = '50% 50%';
        // canvas.style.background = 'rgba(0,0,0,.4)';

        let size = this._map.getSize();
        canvas.width = size.x + this.paddingSize * 2;
        canvas.height = size.y + this.paddingSize * 2;
        canvas.style.width = size.x + this.paddingSize * 2 + 'px';
        canvas.style.height = size.y + this.paddingSize * 2 + 'px';

        paper.setup(this._canvas);

        this._map._panes.overlayPane.appendChild(this._canvas);
        canvas.style.top = -1 * this.paddingSize + 'px';
        canvas.style.left = -1 * this.paddingSize + 'px';
    },

    _animateZoom: function(e) {
        let scale = this._map.getZoomScale(e.zoom),
            offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale);
        // .subtract(this._map._getMapPanePos());

        debugger;

        paper.project.activeLayer.tween(
            {
                scaling: scale,
                'position.x': this._originPosition.x + -1 * offset.x,
                'position.y': this._originPosition.y + -1 * offset.y
            },
            300
        );
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
