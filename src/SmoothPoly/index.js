import L from 'leaflet';
import 'leaflet-geometryutil';
import paper from 'paper';

L.SmoothPolygonsLayer = (L.Layer ? L.Layer : L.Class).extend({
    addTo: function(map) {
        map.addLayer(this);
        return this;
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

    draw: function(polygon, centralPoint, { onMouseEnter, onMouseLeave, onClick, onMouseMove } = {}) {
        if (!this._polygon && !polygon) return;
        if (!this._exclude) this._exclude = [];
        if (onClick) this._onClick = onClick;
        if (onMouseEnter) this._onMouseEnter = onMouseEnter;
        if (onMouseLeave) this._onMouseLeave = onMouseLeave;
        if (onMouseMove) this._onMouseMove = onMouseMove;

        this._polygon = polygon ? { ...polygon } : this._polygon;
        this._centralPoint = { ...this._centralPoint, ...centralPoint };

        // Перегоняем данные в точки на карте с геокоординатами
        this._polygonCoords = this.getPolygonsCord(this._polygon.data, this._centralPoint);

        if (this.path3) this.path3.remove();
        if (this._exclude.length) this._exclude.forEach((item) => item.remove());

        this.path1 = new paper.Path({
            segments: this._polygonCoords,
            fillColor: 'rgba(0,0,0,.5)',
            closed: true
        });

        this.path1.smooth();

        this.path1.simplify();

        this.path3 = this._polygon.exclude.reduce((_result, item) => {
            return item.polygons.reduce((result, item) => {
                const excludePath = new paper.Path({
                    segments: this.getPolygonsCord(item.data, this._centralPoint),
                    closed: true
                });

                excludePath.smooth();

                excludePath.simplify();

                result = result.subtract(excludePath);
                excludePath.remove();

                return result;
            }, this.path1);
        }, this.path1);

        this.path3.fullySelected = false;

        if (this.path1) this.path1.remove();

        this.path3.bringToFront();
        this.path3._onClick = (e) => {
            this._onClick && this._onClick(e, { polygon: this._polygon, layer: this });
        };

        this.path3.onMouseEnter = (e) => {
            this._onMouseEnter && this._onMouseEnter(e, { polygon: this._polygon, layer: this });
        };

        this.path3.onMouseMove = (e) => {
            this._onMouseMove && this._onMouseMove(e, { polygon: this._polygon, layer: this });
        };

        this.path3.onMouseLeave = (e) => {
            this._onMouseLeave && this._onMouseLeave(e, { polygon: this._polygon, layer: this });
        };

        // Draw the view now:
        paper.view.draw();
    },

    onAdd: function(map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        map._panes.overlayPane.appendChild(this._canvas);

        map.on('move', this._reset, this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }
    },

    onRemove: function(map) {
        map.getPanes().overlayPane.removeChild(this._canvas);

        map.off('move', this._reset, this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoom, this);
        }
    },

    _reset: function() {
        let topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        this.draw();
    },

    _initCanvas: function() {
        let canvas = (this._canvas = L.DomUtil.create('canvas', 'leaflet-smooth-polygon-layer leaflet-layer'));

        canvas.id = 'test';

        let originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
        canvas.style[originProp] = '50% 50%';

        let size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;

        paper.setup(this._canvas);
    },

    _animateZoom: function(e) {
        let scale = this._map.getZoomScale(e.zoom),
            offset = this._map
                ._getCenterOffset(e.center)
                ._multiplyBy(-scale)
                .subtract(this._map._getMapPanePos());

        if (L.DomUtil.setTransform) {
            L.DomUtil.setTransform(this._canvas, offset, scale);
        } else {
            this._canvas.style[L.DomUtil.TRANSFORM] = L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ')';
        }
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
