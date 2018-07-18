# resource-base-interface
<img src="http://img.shields.io/npm/v/%40restorecommerce%2Fresource%2Dbase%2Dinterface.svg?style=flat-square" alt="">[![Build Status][build]](https://travis-ci.org/restorecommerce/resource-base-interface?branch=master)[![Dependencies][depend]](https://david-dm.org/restorecommerce/resource-base-interface)[![Coverage Status][cover]](https://coveralls.io/github/restorecommerce/resource-base-interface?branch=master)

[version]: http://img.shields.io/npm/v/resource-base-interface.svg?style=flat-square
[build]: http://img.shields.io/travis/restorecommerce/resource-base-interface/master.svg?style=flat-square
[depend]: https://img.shields.io/david/restorecommerce/resource-base-interface.svg?style=flat-square
[cover]: http://img.shields.io/coveralls/restorecommerce/resource-base-interface/master.svg?style=flat-square

The `resource-base-interface` describes resource CRUD operations which can be bound to a service. Such operations are described via a [gRPC](https://grpc.io/docs/) interface with the message structures therefore being defined using [Protocol Buffers](https://developers.google.com/protocol-buffers/). This interface can be bound with any protobuf definition as long as it contains the endpoints defined in the [resource-base.proto](https://github.com/restorecommerce/protos/blob/master/io/restorecommerce/resource_base.proto) file (note that any resource message structure can be defined). 

The exposed gRPC methods are implemented by the `ServiceBase` object which uses a `ResourceAPI` instance to perform operations with a database provider. The exposed interface is therefore agnostic to a specific database implementation.
However, a valid database provider is required. A set of such providers is implemented in [chassis-srv](https://github.com/restorecommerce/chassis-srv/). 
This interface emits resource-related messages to [Apache Kafka](https://kafka.apache.org) which can be enabled or disabled at the `ServiceBase`'s constructor.

## gRPC Interface

This interface describes the following gRPC endpoints for a generic resource of type `Resource`.

`io.restorecommerce.resourcebase.Resource`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| id | string | required | identifier for the resource |
| meta | io.restorecommerce.meta.Meta meta | optional | Meta information common to all Restore Commerce resources |
| value | number | optional | value for the resource |
| text | string | optional | textual data for the resource |

### Create

This operation is used for inserting resources to the database.
Requests are performed by providing a list of resources which are returned in the response. A [`meta`](https://github.com/restorecommerce/protos/blob/master/io/restorecommerce/meta.proto) should be present, containing relevant resource ownership information. Timestamps for creation and modification are then appended automatically to this property upon a `Create` request. 

`io.restorecommerce.resourcebase.ResourceList`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| items | [ ] `io.restorecommerce.resourcebase.Resource` | required | list of resources |
| total_count | number | optional | total number of resources |

### Read

This operation returns resources based on provided filter and options.
Requests are performed using `io.restorecommerce.resourcebase.ReadRequest` and responses are a list of resources.

`google.protobuf.Struct`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| fields | map<string, Value> | optional | Unordered map of dynamically typed values. |


`io.restorecommerce.resourcebase.Sort`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| field | string | optional | field to be sorted upon |
| SortOrder | enum | optional | sorting order, `UNSORTED`, `ASCENDING` or `DESCENDING` |


`io.restorecommerce.resourcebase.FieldFilter`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| name | string | optional | field name |
| include | bool | optional | include or exclude field |


`io.restorecommerce.resourcebase.ScopeFilter`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| scope | string | optional | scope to operate on |
| instance | string | optional | value to compare |


`io.restorecommerce.resourcebase.ReadRequest`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| offset | number | optional | offset of the resource |
| limit | number | optional | limit, default value is `1000` |
| filter | google.protobuf.Struct | optional | filter based on field values, multiple filters can be combined with `AND` and `OR` operators  |
| sort | [ ]`io.restorecommerce.resourcebase.Sort` | optional | sort the resources |
| field | [ ] `io.restorecommerce.resourcebase.FieldFilter` | optional | fields selector, list of fields to be included or excluded, by default we get all the fields |
| search | [ ]string | optional | word search, not yet implemeneted |
| locales_limiter | [ ]string | optional | querying based on locales, not yet implemented |
| scope | `io.restorecommerce.resourcebase.ScopeFilter` | optional | scope to operate on, not yet implemented |

### Update

This operation is used for updating resources in the database.
Requests are performed by providing a list of resources and all updated items are returned within the response. Note that the only required properties on each resource are its `id` and the properties which are meant to be modified.

### Upsert

This operation is used for updating resources in the database or creating them if they do not exist.
Requests are performed  by providing a resource list, which is returned in the response.

### Delete

This operation is used for deleting resources in the database.
Requests are performed using `io.restorecommerce.resourcebase.DeleteRequest` and responses are `google.protobuf.Empty` messages.

`io.restorecommerce.resourcebase.DeleteRequest`

| Field | Type | Label | Description |
| ----- | ---- | ----- | ----------- |
| collection | string | required | Name of the target collection |
| ids | [ ]string | Optional | List of resource identifiers to be deleted; if empty or not provided, the whole collection is truncated |

## Kafka Events

A kafka [`Topic`](https://github.com/restorecommerce/kafka-client/blob/master/src/events/provider/kafka/index.ts) can be provided when instantiating a `ServiceBase`. If `enableEvents` is set to true, a list of events is then emitted to Kafka by this microservice for each document of each CRUD request :
- <ResourceName>Created
- <ResourceName>Read
- <ResourceName>Modified
- <ResourceName>Deleted

The events emitted to Kafka can be used for restoring the system in case of failure by implementing a [command-interface](https://github.com/restorecommerce/chassis-srv/blob/master/command-interface.md) in the used microservice. For usage details please see [command-interface tests](https://github.com/restorecommerce/chassis-srv/blob/master/test/command_test.ts).

## Fields Configuration

It is possible to pass a fields [`configuration object`](test/cfg/config.json#L235) to `ResourceAPI` in order to enable some special field handlers.

### Field Generators

The `strategies` property can be used to specify fields within each resource which should be generated automatically. Such autogeneration feature currently includes UUIDs, timestamps and sequential counters. The latter one is particularly useful for fields such as a customer or an item number, which can have a type of sequential logic. In these cases, a [Redis](https://redis.io/) database is used to generate and read these values efficiently.

### Buffer Fields

Buffer-encoded fields can be decoded before being stored in the database. It is possible to specify within the `bufferFields` property what fields of each resource should be specially handled this way. The values are also encoded into a buffer again when read from the database.

### Required Fields

It is possible to specify which fields are required for each document of each resource on the `requiredFields` config.
An `InvalidArgument` error is thrown if one of these fields is missing when attempting to store a document.

## Usage

See [tests](test/).
