import * as _ from 'lodash';
import { GraphDatabaseProvider } from '@restorecommerce/chassis-srv';

/**
 * Graph Resource API base provides functions for graph Operations such as
 * creating or modifying Vertices/Edges, graph traversal etc.
 */
export class GraphResourcesServiceBase {
  bufferedCollections: any;
  /**
   * @constructor
   * @param  {object} db Chassis arangodb provider.
   */
  constructor(private db: GraphDatabaseProvider, private bufferFiledCfg?: any) {
    if (bufferFiledCfg) {
      this.bufferedCollections = [];
      for (let key in bufferFiledCfg) {
        // mapping of collection name to the property to be marshalled
        this.bufferedCollections.push(key);
      }
    }
  }

  /**
  * collection traversal - Performs a traversal starting from the given
  * startVertex and following edges contained in this edge collection.
  *
  * @param {any} call request object containing start_vertex, opts and collection name.
  * The start_vertex can be either the _id of a document in the database,
  * the _key of an edge in the collection, or a document
  * (i.e. an object with an _id or _key property).
  * opts contains the options such as opts.direction, opts.filter, opts.visitor,
  * opts.init, opts.expander, opts.sort
  * @param  {any} context context.
  * @return  {TraversalResponse} TraversalResponse containing VertexFields,
  * traversed pahts and materialized data
  */
  async traversal(call: any, context?: any): Promise<any> {
    const request = call.request?.request;
    const collection_name = request.collection_name;
    let start_vertex = request.start_vertex;
    if (_.isEmpty(start_vertex)) {
      start_vertex = request?.start_vertices;
      if (!_.isEmpty(start_vertex)) {
        start_vertex = start_vertex.vertices;
      }
    }
    const opts = request?.opts;
    if (_.isEmpty(start_vertex)) {
      throw new Error('missing start vertex');
    }
    const edge_name = request?.edge_name;
    let data;
    let path;
    let aql;
    if (request?.data) {
      data = request?.data;
    }
    if (request?.path) {
      path = request?.path;
    }
    if (request?.aql) {
      aql = request?.aql;
    }
    const queryResult = await this.db.traversal(start_vertex, opts,
      collection_name, edge_name, data, path, aql);
    let idPropertyMapping = new Map<String, String>();
    const vertexFields = queryResult.vertex_fields || [];
    let marshallRequired = false;
    for (let eachVertex of vertexFields) {
      const collectionArray = eachVertex._id.split('/');
      const resourceName = collectionArray[0].substring(0, collectionArray[0].length - 1);
      marshallRequired = true;
      if (this.bufferedCollections.indexOf(resourceName) > -1) {
        // need to marshall this collection instance data
        // map id to the actual key which needs to be marshelled
        idPropertyMapping.set(collectionArray[1], this.bufferFiledCfg[resourceName]);
        marshallRequired = true;
      }
      // sanitize fields to remove _key, _rev and rename _id to id field
      delete eachVertex._key;
      delete eachVertex._rev;
      eachVertex['id'] = eachVertex._id;
      delete eachVertex._id;
    }
    let completeDecodedData = [];
    if (marshallRequired || (queryResult && queryResult.data && queryResult.data.value)) {
      // get the decoded JSON list of resources.
      const decodedData = JSON.parse(Buffer.from(queryResult.data.value).toString());
      for (let doc of decodedData) {
        if (idPropertyMapping.has(doc.id)) {
          completeDecodedData.push(this.marshallData(doc, idPropertyMapping.get(doc.id)));
        } else {
          completeDecodedData.push(doc);
        }
      }
    }
    const size = 150;
    const completeVertexFields = queryResult.vertex_fields;
    while ((completeDecodedData && completeDecodedData.length > 0) ||
      (completeVertexFields && completeVertexFields.length > 0)) {
      if (completeDecodedData.length > 0) {
        const partDoc = completeDecodedData.splice(0, 1000);
        queryResult.data = { value: Buffer.from(JSON.stringify(partDoc)) };
      }
      if (completeVertexFields.length > 0) {
        queryResult.vertex_fields = completeVertexFields.splice(0, size);
      }
      await call.write(queryResult);
    }
    if (queryResult && queryResult.paths && queryResult.paths.value) {
      await call.write(queryResult);
    }
    await call.end();
  }

  /**
   * marshall the data
   *
   * @param document resource data
   * @param bufferField property specified in config to be marshalled
   * @return document
   */
  marshallData(document: any, bufferField: any): any {
    if (bufferField in document && document[bufferField]) {
      const decodedMsg = document[bufferField];
      // convert the Msg obj to Buffer Obj
      const encodedBufferObj = Buffer.from(JSON.stringify(decodedMsg));
      document[bufferField] = {};
      document[bufferField].value = encodedBufferObj;
    }
    return document;
  }
}
