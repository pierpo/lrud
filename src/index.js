var EventEmitter = require('tiny-emitter')
var assign = require('object-assign')
var KeyCodes = require('./key-codes')

var either = function (arg, a, b) { return arg === a || arg === b }

function Lrud () {
  this.nodes = {}
  this.root = null
  this.currentFocus = null
}

function isValidLRUDEvent (event, node) {
  return (
    node.orientation === 'horizontal' && either(
      Lrud.KEY_CODES[event.keyCode],
      Lrud.KEY_MAP.LEFT,
      Lrud.KEY_MAP.RIGHT
    )
  ) || (
    node.orientation === 'vertical' && either(
      Lrud.KEY_CODES[event.keyCode],
      Lrud.KEY_MAP.UP,
      Lrud.KEY_MAP.DOWN
    )
  )
}

Lrud.prototype = Object.create(EventEmitter.prototype)

assign(Lrud.prototype, {
  register: function (id, props) {
    if (!id) throw new Error('Attempting to register with an invalid id')

    var node = this._createNode(id, props)

    if (node.parent) {
      var parentNode = this._createNode(node.parent)

      if (parentNode.children.indexOf(id) === -1) {
        parentNode.children.push(id)
      }

      this.nodes[node.parent] = parentNode
    } else {
      this.root = id
    }

    this.nodes[id] = node
  },

  unregister: function (id) {
    var node = this.nodes[id]
    if (!node) return

    var parentNode = this.nodes[node.parent]

    if (parentNode) {
      parentNode.children = parentNode.children.filter(function (cid) {
        return cid !== id
      })

      if (parentNode.activeChild === id) {
        parentNode.activeChild = undefined
      }
    }

    if (this.currentFocus === id) {
      this.blur()
      this.currentFocus = undefined
    }

    delete this.nodes[id]
    node.children.forEach(this.unregister.bind(this))
  },

  blur: function (id) {
    var node = this.nodes[id] || this.nodes[this.currentFocus]
    if (node) this.emit('blur', node.id)
  },

  focus: function (id) {
    var node = this.nodes[id] || this.nodes[this.currentFocus] || this.nodes[this.root]
    if (!node) return

    var activeChild = node.activeChild || node.children[0]
    if (activeChild) {
      return this.focus(activeChild)
    }

    this.blur()
    this.currentFocus = node.id
    this.emit('focus', this.currentFocus)
    this._bubbleActive(this.currentFocus)
  },

  handleKeyEvent: function (event) {
    this._bubbleKeyEvent(event, this.currentFocus)
  },

  destroy: function () {
    this.e = {}
    this.nodes = {}
    this.root = null
    this.currentFocus = null
  },

  setActiveChild: function (id, child) {
    var node = this.nodes[id]
    if (!node || node.children.indexOf(child) === -1) return

    if (node.activeChild !== child) {
      if (node.activeChild) {
        this.emit('inactive', node.activeChild)
      }

      this.emit('active', child)
      node.activeChild = child
    }
  },

  setActiveIndex: function (id, index) {
    var node = this.nodes[id]
    if (!node || !node.children[index]) return

    this.setActiveChild(id, node.children[index])
  },

  _createNode: function (id, props) {
    return assign({ id: id, children: [] }, this.nodes[id] || {}, props || {})
  },

  _findChild: function (parent, predicate) {
    if (!parent) return

    var id = parent.activeChild || parent.children[0]
    var node = this.nodes[id]

    if (node && !predicate(node)) {
      return this._findChild(node, predicate)
    }

    return node
  },

  _updateGrid: function (node) {
    var rowNode = this._findChild(node, function (n) { return !!n.orientation })
    if (!rowNode) return

    var activeChild = rowNode.activeChild || rowNode.children[0]
    var activeIndex = rowNode.children.indexOf(activeChild)

    node.children.forEach(function (id) {
      this.setActiveIndex(id, Math.min(
        this.nodes[id].children.length - 1,
        activeIndex
      ))
    }.bind(this))
  },

  _bubbleKeyEvent: function (event, id) {
    var node = this.nodes[id]
    if (!node) return

    var key = Lrud.KEY_CODES[event.keyCode]

    if (key === Lrud.KEY_MAP.ENTER) {
      return this.emit('select', id)
    }

    if (isValidLRUDEvent(event, node)) {
      var activeChild = node.activeChild || node.children[0]
      var activeIndex = node.children.indexOf(activeChild)
      var offset = either(key, Lrud.KEY_MAP.RIGHT, Lrud.KEY_MAP.DOWN) ? 1 : -1
      var nextIndex = activeIndex + offset
      var listSize = node.children.length
      var nextActiveIndex = node.wrapping ? (nextIndex + listSize) % listSize : nextIndex
      var nextActiveChild = node.children[nextActiveIndex]

      if (nextActiveChild) {
        if (node.grid) {
          this._updateGrid(node)
        }

        this.emit('move', {
          id: id,
          offset: offset,
          orientation: node.orientation,
          enter: {
            id: nextActiveChild,
            index: nextActiveIndex
          },
          leave: {
            id: activeChild,
            index: activeIndex
          }
        })

        this.focus(nextActiveChild)
        return event.stopPropagation()
      }
    }

    this._bubbleKeyEvent(event, node.parent)
  },

  _bubbleActive: function (id) {
    var node = this.nodes[id]

    if (node.parent) {
      this.setActiveChild(node.parent, id)
      this._bubbleActive(node.parent)
    }
  }
})

Lrud.KEY_MAP = KeyCodes.map
Lrud.KEY_CODES = KeyCodes.codes

module.exports = Lrud