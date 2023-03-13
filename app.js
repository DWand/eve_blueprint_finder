(function() {

    function activate() {
        var app = new App();
    }

    function ensureKeyExist(mapping, key, defaultValue) {
        if (!Object.prototype.hasOwnProperty.call(mapping, key)) {
            mapping[key] = defaultValue;
        }
    }

    function Blueprint(itemId, materials, products) {
        this.itemId = itemId;
        this.materials = materials;
        this.products = products;
    }

    Blueprint.fromRawStaticData = function (data) {
        var itemId = data[0];

        var rawMaterials = data[1];
        var materials = rawMaterials.map(function (rawMaterial) {
            return ItemGroup.fromRawStaticData(rawMaterial);
        });

        var rawProducts = data[2];
        var products = rawProducts.map(function (rawProduct) {
            return ItemGroup.fromRawStaticData(rawProduct);
        });

        return new Blueprint(itemId, materials, products);
    };

    function ItemGroup(itemId, quantity) {
        this.itemId = itemId;
        this.quantity = quantity;
    }

    ItemGroup.fromRawStaticData = function (data) {
        var itemId = data[0];
        var quantity = data[1];
        return new ItemGroup(itemId, quantity);
    };

    function ItemNameInfo(language, name, itemId) {
        this.language = language;
        this.name = name;
        this.itemId = itemId;
    }

    function Database() {
        this._rawStaticData = window.DATA;

        this._itemNameInfo = [];
        this._nameInfoIndeciesByItemId = {};
        this._nameInfoIndeciesByItemName = {};
        this._blueprintsById = {};
        this._blueprintIdsByMaterialId = {};

        this._parseRawStaticData();
    }

    Database.prototype._parseRawStaticData = function() {
        this._parseRawBlueprints();
        this._parseRawNames();
    };

    Database.prototype._parseRawBlueprints = function () {
        var rawData = this._rawStaticData;
        var rawBlueprints = rawData.blueprints;

        for (var i = 0; i < rawBlueprints.length; i++) {
            var rawBlueprint = rawBlueprints[i];

            var blueprint = Blueprint.fromRawStaticData(rawBlueprint);
            this._blueprintsById[blueprint.itemId] = blueprint;

            for (var j = 0; j < blueprint.materials.length; j++) {
                var material = blueprint.materials[j];

                ensureKeyExist(this._blueprintIdsByMaterialId, material.itemId, []);
                this._blueprintIdsByMaterialId[material.itemId].push(blueprint.itemId);
            }
        }
    };

    Database.prototype._parseRawNames = function () {
        var rawData = this._rawStaticData;
        var rawNames = rawData.names;

        for (var i = 0; i < rawNames.length; i++) {
            var rawNameData = rawNames[i];

            var itemId = rawNameData[0];

            var compressedNames = rawNameData[1];
            var names = compressedNames.map(function (name, index, array) {
                if (!isNaN(name)) {
                    name = array[parseInt(name)];
                }
                return name;
            });

            this._nameInfoIndeciesByItemId[itemId] = {};

            for (var j = 0; j < names.length; j++) {
                var name = names[j];

                this._itemNameInfo.push(new ItemNameInfo(j, name, itemId));
                var nameInfoIndex = this._itemNameInfo.length - 1;

                ensureKeyExist(this._nameInfoIndeciesByItemName, name, {});
                this._nameInfoIndeciesByItemName[name][j] = nameInfoIndex;
                this._nameInfoIndeciesByItemId[itemId][j] = nameInfoIndex;
            }
        }
    };

    Database.prototype.getNameById = function (itemId, language) {
        var nameInfoIndices = this._nameInfoIndeciesByItemId[itemId];
        var nameInfoIndex = nameInfoIndices[language] || nameInfoIndices[0];
        var nameInfo = this._itemNameInfo[nameInfoIndex];
        return nameInfo ? nameInfo.name : '<< Error >>';
    };

    Database.prototype.resolveItemName = function (name) {
        var nameInfoIndices = this._nameInfoIndeciesByItemName[name] || {};
        var languages = Object.keys(nameInfoIndices);
        if (languages.length) {
            return this._itemNameInfo[nameInfoIndices[languages.sort()[0]]];
        }
        return null;
    };

    Database.prototype.getBlueprintIdsByMaterialId = function (itemId) {
        return this._blueprintIdsByMaterialId[itemId] || [];
    };

    Database.prototype.getBlueprintById = function (itemId) {
        return this._blueprintsById[itemId] || null;
    };

    function App() {
        this._formEl = document.querySelector('form');
        this._completenessFld = document.querySelector('#completenessFld');
        this._assetsFld = document.querySelector('#assetsFld');
        this._blueprintsSection = document.querySelector('.blueprints');
        this._messageEl = document.querySelector('.blueprints .message');
        this._listEl = document.querySelector('.blueprints .list');

        this._db = new Database();

        this._formEl.addEventListener('submit', function (event) {
            event.preventDefault();

            this._find();

            return false;
        }.bind(this));
    }

    App.prototype._find = function() {
        this._showWait(true);

        var assets = this._getAssets();
        var completeness = this._getCompleteness();

        var blueprintStats = this._findBlueprintsForMaterials(assets.materials, completeness);

        this._renderBlueprintStats(blueprintStats, assets.language);

        this._showWait(false);
    };

    App.prototype._getCompleteness = function () {
        return this._completenessFld.value;
    };

    App.prototype._getAssets = function () {
        var lines = this._parseAssetsLines();

        var materials = {};
        var languageUsages = {};

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            var nameInfo = line[0];
            var quantity = line[1];
            var itemId = nameInfo.itemId;

            if (!materials[itemId]) {
                materials[itemId] = new ItemGroup(itemId, quantity);
            } else {
                materials[itemId].quantity += quantity;
            }

            ensureKeyExist(languageUsages, nameInfo.language, 0);
            languageUsages[nameInfo.language] += 1;
        }

        var languagesSorted = Object.keys(languageUsages).sort(function (a, b) {
            return languageUsages[a] - languageUsages[b];
        });
        var language = languagesSorted.length ? languagesSorted[0] : null;

        return {
            'language': language,
            'materials': materials
        };
    };

    App.prototype._parseAssetsLines = function () {
        return this._assetsFld.value.split('\n').map(function (line) {
            var info = line.split('\t');

            var name = info[0];
            var quantity = parseInt(info[1] || 0);
            var nameInfo = this._db.resolveItemName(name);

            return [nameInfo, quantity];
        }.bind(this)).filter(function (item) {
            return item[0];
        });
    };

    App.prototype._findBlueprintsForMaterials = function (materials, minCompleteness) {
        var MATERIAL_TYPE_ASSET = 'asset';
        var MATERIAL_TYPE_PRODUCT = 'product';

        var blueprints = {};
        var materialTypes = {};
        var blueprintByProduct = {};

        var newMaterialIds = Object.keys(materials);
        newMaterialIds.forEach(function (materialId) {
            materialTypes[materialId] = MATERIAL_TYPE_ASSET;
        });

        // Find all possible blueprints
        while (newMaterialIds.length > 0) {
            var producedMaterialIds = [];

            newMaterialIds.forEach(function (materialId) {
                this._db
                    .getBlueprintIdsByMaterialId(materialId)
                    .forEach(function (blueprintId) {
                        if (blueprints[blueprintId]) {
                            // Blueprint with multiple materials. We've already processed it.
                            return;
                        }

                        var blueprint = this._db.getBlueprintById(blueprintId);
                        if (!blueprint) {
                            // Missing blueprint. Some data is missing in static export.
                            return;
                        }

                        blueprints[blueprintId] = blueprint;

                        blueprint.products
                            .map(function (product) {
                                return product.itemId;
                            })
                            .filter(function (itemId) {
                                return (
                                    materialTypes[itemId] === undefined &&
                                    newMaterialIds.indexOf(itemId) < 0 &&
                                    producedMaterialIds.indexOf(itemId) < 0);
                            })
                            .forEach(function (itemId) {
                                if (!materialTypes[itemId]) {
                                    materialTypes[itemId] = MATERIAL_TYPE_PRODUCT;
                                }
                                producedMaterialIds.push(itemId);
                                blueprintByProduct[itemId] = blueprintId;
                            });
                    }.bind(this));
            }.bind(this));

            newMaterialIds = producedMaterialIds;
        }

        // Validate blueprints
        var blueprintValidity = {};
        var blueprintCompleteness = {};
        var unresolvedBlueprintIds = Object.keys(blueprints);
        var updateCounter = 1;
        while (updateCounter > 0) {
            updateCounter = 0;

            unresolvedBlueprintIds.forEach(function (blueprintId) {
                var blueprint = blueprints[blueprintId];

                var validCounter = 0;
                var invalidCounter = 0;
                var unknownCounter = 0;

                blueprint.materials.forEach(function (material) {
                    var materialId = material.itemId;
                    var materialType = materialTypes[materialId];
                    if (materialType === undefined) {
                        invalidCounter += 1;
                    } else if (materialType === MATERIAL_TYPE_ASSET) {
                        validCounter += 1;
                    } else {
                        var producedById = blueprintByProduct[materialId];
                        var isProductValid = blueprintValidity[producedById];
                        if (isProductValid === true) {
                            validCounter += 1;
                        } else if (isProductValid === false) {
                            invalidCounter += 1;
                        } else {
                            unknownCounter += 1;
                        }
                    }
                });

                if (unknownCounter === 0) {
                    var completeness = validCounter / (validCounter + invalidCounter) * 100;
                    blueprintCompleteness[blueprintId] = completeness;
                    blueprintValidity[blueprintId] = completeness >= minCompleteness;
                    updateCounter += 1;
                }
            });

            unresolvedBlueprintIds = unresolvedBlueprintIds.filter(function (blueprintId) {
                return blueprintValidity[blueprintId] === undefined;
            });
        }

        // Generate stats
        return Object.keys(blueprints)
            .filter(function (blueprintId) {
                return blueprintValidity[blueprintId];
            })
            .map(function (blueprintId) {
                var blueprint = blueprints[blueprintId];
                var completeness = blueprintCompleteness[blueprintId];

                var isDirectMatch = true;
                blueprint.materials.forEach(function (material) {
                    if (materialTypes[material.itemId] !== MATERIAL_TYPE_ASSET) {
                        isDirectMatch = false;
                    }
                });

                return {
                    completeness: Math.round(completeness),
                    direct: isDirectMatch,
                    blueprint: blueprint
                };
            })
            .sort(function (a, b) {
                return b.completeness - a.completeness;
            });
    };

    App.prototype._renderBlueprintStats = function (blueprintStats, language) {
        if (!blueprintStats.length) {
            this._showMessage('It is impossible to build anything using the provided assets.');
        } else {
            this._showMessage('');
        }
        this._renderList(blueprintStats, language);
    };

    App.prototype._renderList = function (blueprintStats, language) {
        var html = '<ul>';

        for (var i = 0; i < blueprintStats.length; i++) {
            var stats = blueprintStats[i];
            var blueprint = stats.blueprint;

            var name = this._db.getNameById(blueprint.itemId);
            var completeness = stats.completeness;
            var direct = stats.direct ? 'direct' : 'indirect';
            var link = 'https://www.fuzzwork.co.uk/blueprint/?typeid=' + blueprint.itemId;

            html += [
                '<li>',
                    '<span class="name"><a href="' + link + '" target="_blank">' + name + '</a></span>',
                    '<span class="status">',
                        '<span class="direct">' + direct + '</span>',
                        '<span class="completeness">' + completeness + '%</span>',
                    '</span>',
                '</li>'
            ].join('');
        }

        html += '</ul>';

        this._listEl.innerHTML = html;
    };

    App.prototype._showMessage = function (message) {
        this._messageEl.innerHTML = message;
    };

    App.prototype._showWait = function (shouldWait) {
        if (shouldWait) {
            this._blueprintsSection.classList.add('wait');
        } else {
            this._blueprintsSection.classList.remove('wait');
        }
    };

    activate();

})();