import json
import logging
import sys

from yaml import load, Loader


logger = logging.getLogger(__name__)


def run():
    used_type_ids = set()
    blueprints = []
    item_names = []

    logger.debug('Reading blueprints.yaml...')
    with open('data/blueprints.yaml', 'r') as f:
        raw_data = f.read()

        logger.debug('Parsing blueprints.yaml...')
        data = load(raw_data, Loader=Loader)

        logger.debug('Processing blueprints.yaml...')
        for blueprint in data.values():
            type_id = blueprint['blueprintTypeID']
            used_type_ids.add(type_id)

            activities = blueprint.get('activities', {})
            manufacturing = activities.get('manufacturing', {})

            materials = []
            for material in manufacturing.get('materials', []):
                materials.append([material['typeID'], material['quantity']])
                used_type_ids.add(material['typeID'])

            products = []
            for product in manufacturing.get('products', []):
                products.append([product['typeID'], product['quantity']])
                used_type_ids.add(product['typeID'])

            if materials and products:
                blueprints.append([type_id, materials, products])

    logger.debug('Reading typeIDs.yaml...')
    with open('data/typeIDs.yaml', 'r') as f:
        raw_data = f.read()

        logger.debug('Parsing typeIDs.yaml...')
        data = load(raw_data, Loader=Loader)

        logger.debug('Processing typeIDs.yaml...')
        langs = ['en', 'de', 'es', 'fr', 'ja', 'ru', 'zh']
        indexed_langs = list(enumerate(langs))
        for type_id in used_type_ids:
            info = data.get(type_id, {})
            names = info.get('name', {})

            compressed_names = []
            for curr_index, curr_lang in indexed_langs:
                curr_name = names.get(curr_lang, '').strip()

                for prev_index, prev_lang in indexed_langs:
                    if curr_index == prev_index:
                        break
                    prev_name = compressed_names[prev_index]
                    if curr_name == prev_name:
                        curr_name = prev_index
                        break

                compressed_names.append(curr_name)

            item_names.append([type_id, compressed_names])

    logger.debug('Writing export.json...')
    with open('data/export.json', 'w+', encoding='utf8') as f:
        json.dump({
            'blueprints': blueprints,
            'names': item_names
        }, f, ensure_ascii=False)

    logger.debug('All Done.')


if __name__ == '__main__':
    logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)
    run()
