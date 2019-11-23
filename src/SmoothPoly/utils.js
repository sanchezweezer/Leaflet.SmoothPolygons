import L from 'leaflet';

const isNotProd = process.env.NODE_ENV !== 'production';

const debug = (text) => isNotProd && console.log(text);

const debounce = (fn, ms = 0) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

const defaultDrawFunc = ({ path }) => {
  path.smooth();

  path.simplify();
};

/**
 * Maps polygon data taken from API data to correct format ([x, y])
 * @param coords: array of polygon coordinates in API format ({ Direction, Value })
 * @param center: central point of the polygon
 * @param map: current map object
 * @returns array of coordinates in format [x, y]
 */
const defaultGetPolygonsCord = ({ coords, center, map }) => {
  return coords
    .sort((a, b) => a.Direction - b.Direction)
    .map((item) => {
      const viewPoint = map.latLngToContainerPoint(L.GeometryUtil.destination(center, item.Direction - 90, item.Value));
      return [viewPoint.x, viewPoint.y];
    });
};

export { debounce, debug, defaultDrawFunc, defaultGetPolygonsCord };
