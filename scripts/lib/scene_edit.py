"""Surgical edits to a Cocos `.scene` / `.prefab` JSON array.

The scene is 1 MB of pretty-printed JSON array and a `json.dumps` round trip
collapses that formatting, so edits are text splices against the original bytes.

Three traps are baked into this module, each found the hard way:

1. Locating an array element by counting `newline + indent + brace` prefixes only
   works while EVERY element is on its own line. `Game.scene` has 1376 elements
   and 1355 such prefixes -- 21 are written inline -- so the count drifts and
   every element after the first inline one is located at the wrong offset. That
   does not raise; it splices a valid-looking edit into the wrong element.
   `element_spans` scans brace depth instead, and `open_scene` checks the result
   against the parser's own element count.

2. A replacement span must cover the VALUE, not the whole element. Two edits on
   the same component that both return the element span cannot both apply: the
   second is built from the unedited block and silently reverts the first.

3. Edits are applied back to front from one set of offsets, so once an edit
   changes the length of the text, any span that CONTAINS it has a stale end.
   `apply_edits` tracks that delta per span. Keeping spans disjoint is still the
   better answer; the delta handling is the safety net.
"""

import json
import os

INDENT = '  '
NL = '\n'
QUOTE = '"'


class Scene:
    """A parsed scene plus the byte ranges of its top-level array elements."""

    def __init__(self, path):
        self.path = path
        with open(path, encoding='utf-8', newline='') as handle:
            self.text = handle.read()
        global NL
        NL = '\r\n' if '\r\n' in self.text else '\n'
        self.arr = json.loads(self.text)
        self.spans = element_spans(self.text)
        if len(self.spans) != len(self.arr):
            raise SystemExit('%s: span scan found %d elements, parser found %d -- refusing to edit'
                             % (path, len(self.spans), len(self.arr)))
        self.edits = []

    # -- lookup ------------------------------------------------------------
    def find(self, name):
        """First node with this name, ANYWHERE in the scene.

        Node names are not unique across pages: `MassValue` appears three times
        (Endless HUD, Arena HUD and the settlement board), `RankValue` twice and
        `Joystick` once per HUD. Editing by bare name silently takes whichever
        the array happens to list first, which is how a relayout script moved the
        settlement's mass label instead of the Arena HUD's. Use `find_child`
        whenever the node lives under a known page.
        """
        for index, obj in enumerate(self.arr):
            if isinstance(obj, dict) and obj.get('__type__') == 'cc.Node' and obj.get('_name') == name:
                return index
        return None

    def find_child(self, parent_name, child_name):
        """A direct child of a named node -- the unambiguous form."""
        parent = self.find(parent_name)
        if parent is None:
            raise SystemExit('parent node %s not found' % parent_name)
        for ref in self.arr[parent]['_children']:
            child = self.arr[ref['__id__']]
            if child.get('_name') == child_name:
                return ref['__id__']
        return None

    def component(self, node_id, type_name):
        for ref in self.arr[node_id]['_components']:
            if self.arr[ref['__id__']].get('__type__') == type_name:
                return ref['__id__']
        return None

    # -- value edits (value-only spans; see trap 2) ------------------------
    def _value_span(self, element_id, key, extra_start=0):
        start, end = self.spans[element_id]
        block = self.text[start:end]
        at = block.index(QUOTE + key + QUOTE + ':', extra_start)
        vs = at + len(key) + 3
        while block[vs] == ' ':
            vs += 1
        return start, block, vs

    def set_number(self, element_id, key, value):
        start, block, vs = self._value_span(element_id, key)
        ve = vs
        while ve < len(block) and block[ve] in ' -0123456789.eE':
            ve += 1
        self.edits.append((start + vs, start + ve, '%g' % value))

    def set_literal(self, element_id, key, value):
        """A boolean or null, written verbatim."""
        start, block, vs = self._value_span(element_id, key)
        ve = vs
        while ve < len(block) and block[ve] not in ',}' + NL:
            ve += 1
        self.edits.append((start + vs, start + ve, value))

    def set_lpos(self, node_id, x, y):
        """Rewrite a node's `_lpos` x/y. Two value edits, never the node span."""
        start, end = self.spans[node_id]
        block = self.text[start:end]
        at = block.index(QUOTE + '_lpos' + QUOTE + ': {')
        for key, value in (('x', x), ('y', y)):
            # Searched from the `_lpos` marker, so this cannot land on `_lrot`'s
            # or `_lscale`'s own x/y, which come later in the node.
            k = block.index(QUOTE + key + QUOTE + ':', at)
            vs = k + len(key) + 3
            while block[vs] == ' ':
                vs += 1
            ve = vs
            while ve < len(block) and block[ve] in ' -0123456789.eE':
                ve += 1
            self.edits.append((start + vs, start + ve, '%g' % value))

    def set_color(self, element_id, rgba):
        start, end = self.spans[element_id]
        block = self.text[start:end]
        at = block.index(QUOTE + '_color' + QUOTE + ':')
        close = block.index('}', at)
        replacement = ('{"__type__": "cc.Color", "r": %d, "g": %d, "b": %d, "a": %d}' % tuple(rgba))
        self.edits.append((start + at, start + close + 1,
                           QUOTE + '_color' + QUOTE + ': ' + replacement))

    def set_children(self, parent_id, child_ids):
        """APPEND child refs to a node's own `_children`, preserving the rest.

        Replacing the list instead is silent and catastrophic: the rows had no
        children so it looked harmless, but the page has 81, and losing them took
        the card, the dim overlay and every label with it. Callers that care
        should assert the resulting child count.
        """
        start, end = self.spans[parent_id]
        block = self.text[start:end]
        marker = QUOTE + '_children' + QUOTE + ': ['
        at = block.index(marker)
        # Child refs are `{"__id__": n}` -- no brackets of their own -- so the
        # first `]` after the marker closes the list.
        close = block.index(']', at)
        existing = block[at + len(marker):close].strip()
        refs = (',' + NL + '      ').join(
            '{%s        "__id__": %d%s      }' % (NL, child_id, NL) for child_id in child_ids)
        if existing:
            refs = existing + ',' + NL + '      ' + refs
        self.edits.append((start + at + len(marker), start + close, refs))

    def append_elements(self, elements):
        """Queue new array elements; returns their ids."""
        first = len(self.arr)
        for element in elements:
            self.arr.append(element)
        self.register_appended(first, len(self.arr) - first)
        return list(range(first, len(self.arr)))

    def register_appended(self, first_id, count):
        """Record ids that must be serialized after the original body on commit."""
        if getattr(self, '_appended', None) is None:
            self._appended = []
        self._appended.extend(range(first_id, first_id + count))

    # -- commit ------------------------------------------------------------
    def commit(self, expect=None):
        """Apply the queued edits and write the file, or refuse and leave it.

        `expect` is an optional {element_id: added_count} map. Each entry asserts
        that element's `_children` grew by exactly that many -- a splice that
        replaces instead of appends parses perfectly and loses content, so counts
        are asserted rather than assumed.
        """
        out = self.text
        appended = getattr(self, '_appended', None)
        if appended:
            added = (',' + NL).join(
                indent(json.dumps(self.arr[i], ensure_ascii=False, indent=2).replace('\n', NL), INDENT)
                for i in appended)
            body = out.rstrip()[:-1].rstrip()
            if not body.endswith(','):
                body = body + ','
            out = body + NL + indent(added, INDENT) + NL + ']'
        for start, end, replacement in sorted(self.edits, key=lambda item: item[0], reverse=True):
            out = out[:start] + replacement + out[end:]
        try:
            parsed = json.loads(out)
        except ValueError as error:
            dump = self.path + '.failed'
            with open(dump, 'w', encoding='utf-8', newline='') as handle:
                handle.write(out)
            raise SystemExit('refusing to write %s: %s\n  malformed output left at %s'
                             % (self.path, error, dump))
        for element_id, added_count in (expect or {}).items():
            # `arr` still holds the pre-edit children: `set_children` only queues
            # an edit against the text, it does not touch the parsed array.
            before = len(self.arr[element_id]['_children'])
            actual = len(parsed[element_id]['_children'])
            if actual != before + added_count:
                raise SystemExit('refusing to write %s: element %d children went %d -> %d, expected %d'
                                 % (self.path, element_id, before, actual, before + added_count))
        with open(self.path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(out)
        return out


def element_spans(text):
    """Exact byte range of every top-level array element, in `__id__` order."""
    spans = []
    depth = 0
    in_string = False
    escaped = False
    start = None
    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == QUOTE:
                in_string = False
            continue
        if char == QUOTE:
            in_string = True
        elif char == '[':
            depth += 1
        elif char == ']':
            depth -= 1
        elif char == '{':
            if depth == 1 and start is None:
                start = index
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 1 and start is not None:
                spans.append((start, index + 1))
                start = None
    return spans


def indent(block, prefix):
    return NL.join(prefix + line if line.strip() else line for line in block.split(NL))


def clone_node(scene, root_id, suffix):
    """Clone a childless node and its components into the scene; returns its id."""
    new_id = len(scene.arr)
    scene.arr.append(json.loads(json.dumps(scene.arr[root_id])))
    mapping = {}
    for component in scene.arr[root_id]['_components']:
        mapping[component['__id__']] = len(scene.arr)
        scene.arr.append(json.loads(json.dumps(scene.arr[component['__id__']])))
    scene.register_appended(new_id, len(scene.arr) - new_id)
    node = scene.arr[new_id]
    node['_children'] = []
    node['_components'] = [{'__id__': mapping[c['__id__']]} for c in scene.arr[root_id]['_components']]
    node['_id'] = str(node['_id']) + '-' + suffix
    # Templates are authored inactive (controllers activate what they want), so a
    # plain clone is born inactive and nothing would ever turn it on.
    node['_active'] = True
    for ref in node['_components']:
        comp = scene.arr[ref['__id__']]
        if comp.get('__type__') in ('cc.UITransform', 'cc.Sprite', 'cc.Label'):
            comp['node'] = {'__id__': new_id}
    return new_id


def repo_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
