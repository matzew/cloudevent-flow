blocks = new Blocks();
blocks.scale = 1.4;
var templateMap = {};
var defaults = {};


// Override the addBlock method to add some more stuff
blocks.addBlock = function (name, x, y) {
    console.log("Add blocks:" + name);

    for (var k in this.metas) {
        var type = this.metas[k];

        if (type.name == name) {
            var block = new Block(this, this.metas[k], this.id);
            block.x = x;
            block.y = y;
            block._uuid = guid();
            block.create(this.div.find('.blocks'));

            // Keep the template with the block so that we can get data
            // needed for the deployment
            if (templateMap[name]) {
                block._template = templateMap[name];
            }

            this.history.save();
            this.blocks.push(block);
            this.id++;
        }
    }
};

(function () {
    function include(file) {
        $('head').append('<script type="text/javascript" src="demo/' + file + '"></script>');
    }

    fetchNodeYaml(function (data) {
        setupBlocksJs(data);
        blocks.run('#blocks');
    });

    fetchTopicList(function (data) {
        setupTopicBlocksJs(data);
    });

    fetchDefaults(function (data) {
        defaults = data;
        console.log(defaults);
    });

    //setupBlocksJs(data);


    blocks.ready(function () {

        blocks.menu.addAction('Export', function (blocks) {
            //alert($.toJSON(blocks.export()));
            exportJson();
        }, 'export');

    });


    blocks.types.addCompatibility('string', 'number');
    blocks.types.addCompatibility('string', 'bool');
    blocks.types.addCompatibility('bool', 'number');
    blocks.types.addCompatibility('bool', 'integer');
    blocks.types.addCompatibility('bool', 'string');

})();

function exportJson(flowName) {
    var data = blocks.export();

    // Add the blocks
    var processorArray = new Array();
    var processorJson;
    var inputsArray;
    var outputsArray;
    var settings;
    var block;
    var serializedBlock;

    for (var i = 0; i < data.blocks.length; i++) {
        serializedBlock = data.blocks[i];
        block = blocks.getBlockById(serializedBlock.id);
        if (block && block._template) {
            inputsArray = new Array();
            outputsArray = new Array();
            settings = {};

            if (block._template.inputs) {
                for (var j = 0; j < block._template.inputs.length; j++) {
                    inputsArray.push(block._template.inputs[j]);
                }
            }

            if (block._template.outputs) {
                for (var j = 0; j < block._template.outputs.length; j++) {
                    outputsArray.push(block._template.outputs[j]);
                }
            }

            //todo: this will only copy default values
            if (block._template.settings && block.fields.fields) {
                var field;
                var attrs;
                for (var j = 0; j < block.fields.fields.length; j++) {
                    field = block.fields.fields[j];
                    attrs = field.attrs;
                    if (attrs && attrs.editable) {
                        // This can go in the settings
                        settings[field.name] = field.value;
                    }
                }
            }

            processorJson = {
                imageName: block._template.imageName,
                templateId: block._template.id,
                templateName: block._template.name,
                transport: block._template.transport,
                processorType: block._template.processorType,
                uuid: block._uuid,
                settings: settings,
                inputs: inputsArray,
                outputs: outputsArray
            };

            processorArray.push(processorJson);

        }
    }

    // Add the edges / links
    var block1;
    var block2;
    var serializedEdge;
    var serializedConnector1;
    var serializedConnector2;
    var sourcePort;
    var sourceUuid;
    var targetPort;
    var targetUuid;
    var linksArray = new Array();


    for (var i = 0; i < data.edges.length; i++) {
        serializedEdge = data.edges[i];
        serializedConnector1 = data.edges[i].connector1;
        serializedConnector2 = data.edges[i].connector2;

        block1 = blocks.getBlockById(serializedEdge.block1);
        block2 = blocks.getBlockById(serializedEdge.block2);

        if (serializedConnector1[1] === "output" && serializedConnector2[1] === "input") {
            // 1 is the output, 2 is the input
            sourceUuid = block1._uuid;
            sourcePort = serializedConnector1[0];
            targetUuid = block2._uuid;
            targetPort = serializedConnector2[0];

        } else if (serializedConnector1[1] === "input" && serializedConnector2[1] === "output") {
            sourceUuid = block2._uuid;
            sourcePort = serializedConnector2[0];
            targetUuid = block1._uuid;
            targetPort = serializedConnector1[0];

        } else {
            console.log("Bad connection");
        }
        linksArray.push({
            sourceUuid: sourceUuid,
            targetUuid: targetUuid,
            sourcePortName: sourcePort,
            targetPortName: targetPort
        });

    }

    var result = {
        nodes: processorArray,
        links: linksArray,
        settings: {},
        globalSettings: defaults
    };

    if (flowName) {
        result.name = flowName;
    } else {
        result.name = "unnamed-flow";
    }
    var json = JSON.stringify(result);
    console.log(JSON.stringify(result));
    return json;
}

function setupTopicBlocksJs(topicList) {
    var template;
    var blockData;
    var fields;
    for (var i = 0; i < topicList.length; i++) {
        fields = new Array();
        blockData = {
            name: topicList[i],
            description: "Kafka Topic",
            family: "TOPICS"
        };
        fields.push({

            name: topicList[i],
            type: "string",
            attrs: "output"

        });
        
        fields.push({
            name: "deployable",
            type: "boolean",
            value: false
        })
        blockData.fields = fields;
        
        // Dummy template
        templateMap[topicList[i]] = {
                imageName: "none",
                templateId: "none",
                templateName: topicList[i],
                transport: "kafka",
                uuid: "none",
                processorType: "TOPIC_ENDPOINT",
                outputs: [
                    topicList[i]
                ]
        };
        blocks.register(blockData);        
    }
}


function setupBlocksJs(nodeYamlList) {
    var template;
    var blockData;
    var fields;

    for (var i = 0; i < nodeYamlList.length; i++) {
        template = YAML.parse(nodeYamlList[i]);
        template.deployable = true;

        fields = new Array();
        blockData = {
            name: template.name,
            description: template.description,
            family: "BLOCKS"
        };

        // Keep this for saving
        templateMap[template.name] = template;
        templateMap[template.name].processorType = "DEPLOYABLE_IMAGE";

        /* ADD SETTINGS
         var fields = new Array();
         block = this.blockRegistry.createBlock(blockTemplate.name);
         if (blockTemplate.defaults) {
         this.addBlockDefaults(blockTemplate, fields);
         }
         */

        // ADD INPUTS
        if (template.inputs) {
            for (var j = 0; j < template.inputs.length; j++) {
                fields.push({
                    name: template.inputs[j],
                    type: "string",
                    attrs: "input"
                });
            }
        }

        // ADD OUTPUTS
        if (template.outputs) {
            for (var j = 0; j < template.outputs.length; j++) {
                fields.push({
                    name: template.outputs[j],
                    type: "string",
                    attrs: "output"
                });
            }
        }

        // ADD SETTINGS
        var value;
        var key;
        if (template.settings) {
            var keys = Object.keys(template.settings);

            for (var j = 0; j < keys.length; j++) {
                key = keys[j];
                value = template.settings[key];
                fields.push({
                    name: key,
                    defaultValue: value,
                    type: "string",
                    attrs: "editable"
                });
            }
        }

        blockData.fields = fields;
        console.log(JSON.stringify(blockData));
        blocks.register(blockData);
        console.log("Template: " + i);
    }
}

function fetchTopicList(callback) {
    var promise = $.ajax({
        url: "rest/api/topics",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

function fetchNodeYaml(callback) {

    var promise = $.ajax({
        url: "rest/api/processors",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

function fetchDefaults(callback) {

    var promise = $.ajax({
        url: "rest/api/globalproperties",
        type: 'GET',
        dataType: "json",
        contentType: "application/json; charset=utf-8"
    }).then(function (data) {
        callback(data);
    });
}

// THIS ISN'T A GUID
function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}
