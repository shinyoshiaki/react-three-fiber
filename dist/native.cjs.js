'use strict'

Object.defineProperty(exports, '__esModule', { value: true })

function _interopDefault(ex) {
  return ex && typeof ex === 'object' && 'default' in ex ? ex['default'] : ex
}

var _construct = _interopDefault(require('@babel/runtime/helpers/construct'))
var _objectWithoutPropertiesLoose = _interopDefault(require('@babel/runtime/helpers/objectWithoutPropertiesLoose'))
var _extends = _interopDefault(require('@babel/runtime/helpers/extends'))
var THREE = require('three')
var Reconciler = _interopDefault(require('react-reconciler'))
var scheduler = require('scheduler')
var React = require('react')
var tinyEmitter = require('tiny-emitter')
var usePromise = _interopDefault(require('react-promise-suspense'))
var expoGl = require('expo-gl')
var reactNative = require('react-native')
var expoThree = require('expo-three')

var version = '3.0.16'

function _toPropertyKey(arg) {
  var key = _toPrimitive(arg, 'string')
  return typeof key === 'symbol' ? key : String(key)
}

function _toPrimitive(input, hint) {
  if (typeof input !== 'object' || input === null) return input
  var prim = input[Symbol.toPrimitive]
  if (prim !== undefined) {
    var res = prim.call(input, hint || 'default')
    if (typeof res !== 'object') return res
    throw new TypeError('@@toPrimitive must return a primitive value.')
  }
  return (hint === 'string' ? String : Number)(input)
}
var roots = new Map()
var emptyObject = {}
var is = {
  obj: function obj(a) {
    return a === Object(a)
  },
  str: function str(a) {
    return typeof a === 'string'
  },
  num: function num(a) {
    return typeof a === 'number'
  },
  und: function und(a) {
    return a === void 0
  },
  arr: function arr(a) {
    return Array.isArray(a)
  },
  equ: function equ(a, b) {
    // Wrong type, doesn't match
    if (typeof a !== typeof b) return false // Atomic, just compare a against b

    if (is.str(a) || is.num(a) || is.obj(a)) return a === b // Array, shallow compare first to see if it's a match

    if (is.arr(a) && a == b) return true // Last resort, go through keys

    var i

    for (i in a) {
      if (!(i in b)) return false
    }

    for (i in b) {
      if (a[i] !== b[i]) return false
    }

    return is.und(i) ? a === b : true
  },
}
var globalEffects = []
function addEffect(callback) {
  globalEffects.push(callback)
}
function renderGl(state, timestamp, repeat, runGlobalEffects) {
  if (repeat === void 0) {
    repeat = 0
  }

  if (runGlobalEffects === void 0) {
    runGlobalEffects = false
  }

  // Run global effects
  if (runGlobalEffects)
    globalEffects.forEach(function(effect) {
      return effect(timestamp) && repeat++
    }) // Run local effects

  var delta = state.current.clock.getDelta()
  state.current.subscribers.forEach(function(sub) {
    return sub.ref.current(state.current, delta)
  }) // Decrease frame count

  state.current.frames = Math.max(0, state.current.frames - 1)
  repeat += !state.current.invalidateFrameloop ? 1 : state.current.frames // Render content

  if (!state.current.manual) state.current.gl.render(state.current.scene, state.current.camera)
  return repeat
}
var running = false

function renderLoop(timestamp) {
  running = true
  var repeat = 0 // Run global effects

  globalEffects.forEach(function(effect) {
    return effect(timestamp) && repeat++
  })
  roots.forEach(function(root) {
    var state = root.containerInfo.__state // If the frameloop is invalidated, do not run another frame

    if (state.current.active && state.current.ready && (!state.current.invalidateFrameloop || state.current.frames > 0))
      repeat = renderGl(state, timestamp, repeat)
  })
  if (repeat !== 0) return requestAnimationFrame(renderLoop) // Flag end of operation

  running = false
}

function invalidate(state, frames) {
  if (state === void 0) {
    state = true
  }

  if (frames === void 0) {
    frames = 2
  }

  if (state === true)
    roots.forEach(function(root) {
      return (root.containerInfo.__state.current.frames = frames)
    })
  else if (state && state.current) {
    if (state.current.vr) return
    state.current.frames = frames
  }

  if (!running) {
    running = true
    requestAnimationFrame(renderLoop)
  }
}
var catalogue = {}
var extend = function extend(objects) {
  return void (catalogue = _extends({}, catalogue, {}, objects))
}
function applyProps(instance, newProps, oldProps, accumulative) {
  if (oldProps === void 0) {
    oldProps = {}
  }

  if (accumulative === void 0) {
    accumulative = false
  }

  // Filter equals, events and reserved props
  var container = instance.__container
  var sameProps = Object.keys(newProps).filter(function(key) {
    return is.equ(newProps[key], oldProps[key])
  })
  var handlers = Object.keys(newProps).filter(function(key) {
    return typeof newProps[key] === 'function' && key.startsWith('on')
  })
  var leftOvers = accumulative
    ? Object.keys(oldProps).filter(function(key) {
        return newProps[key] === void 0
      })
    : []
  var filteredProps = [].concat(sameProps, ['children', 'key', 'ref']).reduce(function(acc, prop) {
    var _ = acc[prop],
      rest = _objectWithoutPropertiesLoose(acc, [prop].map(_toPropertyKey))

    return rest
  }, newProps) // Add left-overs as undefined props so they can be removed

  leftOvers.forEach(function(key) {
    return (filteredProps[key] = undefined)
  })

  if (Object.keys(filteredProps).length > 0) {
    Object.entries(filteredProps).forEach(function(_ref) {
      var key = _ref[0],
        value = _ref[1]

      if (!handlers.includes(key)) {
        var root = instance
        var target = root[key]

        if (key.includes('-')) {
          var entries = key.split('-')
          target = entries.reduce(function(acc, key) {
            return acc[key]
          }, instance) // If the target is atomic, it forces us to switch the root

          if (!(target && target.set)) {
            var _entries$reverse = entries.reverse(),
              _name = _entries$reverse[0],
              reverseEntries = _entries$reverse.slice(1)

            root = reverseEntries.reverse().reduce(function(acc, key) {
              return acc[key]
            }, instance)
            key = _name
          }
        } // Special treatment for objects with support for set/copy

        if (target && target.set && (target.copy || target instanceof THREE.Layers)) {
          var _target

          if (target.copy && target.constructor.name === value.constructor.name) target.copy(value)
          else if (Array.isArray(value)) (_target = target).set.apply(_target, value)
          else target.set(value) // Else, just overwrite the value
        } else root[key] = value

        invalidateInstance(instance)
      }
    }) // Preemptively delete the instance from the containers interaction

    if (accumulative && container && instance.raycast && instance.__handlers) {
      instance.__handlers = undefined

      var index = container.__interaction.indexOf(instance)

      if (index > -1) container.__interaction.splice(index, 1)
    } // Prep interaction handlers

    if (handlers.length) {
      // Add interactive object to central container
      if (container && instance.raycast) {
        // Unless the only onUpdate is the only event present we flag the instance as interactive
        if (!(handlers.length === 1 && handlers[0] === 'onUpdate')) container.__interaction.push(instance)
      } // Add handlers to the instances handler-map

      instance.__handlers = handlers.reduce(function(acc, key) {
        var _extends2

        return _extends(
          {},
          acc,
          ((_extends2 = {}), (_extends2[key.charAt(2).toLowerCase() + key.substr(3)] = newProps[key]), _extends2)
        )
      }, {})
    } // Call the update lifecycle when it is being updated, but only when it is part of the scene

    if (instance.parent) updateInstance(instance)
  }
}

function invalidateInstance(instance) {
  if (instance.__container && instance.__container.__state) invalidate(instance.__container.__state)
}

function updateInstance(instance) {
  if (instance.__handlers && instance.__handlers.update) instance.__handlers.update(instance)
}

function createInstance(type, _ref2, container, hostContext, internalInstanceHandle) {
  var _ref2$args = _ref2.args,
    args = _ref2$args === void 0 ? [] : _ref2$args,
    props = _objectWithoutPropertiesLoose(_ref2, ['args'])

  var name = '' + type[0].toUpperCase() + type.slice(1)
  var instance

  if (type === 'primitive') {
    instance = props.object
    instance.__instance = true
  } else if (type === 'new') {
    instance = new props.object(args)
  } else {
    var target = catalogue[name] || THREE[name]
    instance = is.arr(args) ? _construct(target, args) : new target(args)
  } // Bind to the root container in case portals are being used
  // This is perhaps better for event management as we can keep them on a single instance

  while (container.__container) {
    container = container.__container
  } // TODO: https://github.com/facebook/react/issues/17147
  // If it's still not there it means the portal was created on a virtual node outside of react

  if (!roots.has(container)) {
    var fn = function fn(node) {
      if (!node['return']) return node.stateNode && node.stateNode.containerInfo
      else return fn(node['return'])
    }

    container = fn(internalInstanceHandle)
  } // Apply initial props

  instance.__objects = []
  instance.__container = container // It should NOT call onUpdate on object instanciation, because it hasn't been added to the
  // view yet. If the callback relies on references for instance, they won't be ready yet, this is
  // why it passes "false" here

  applyProps(instance, props, {})
  return instance
}

function appendChild(parentInstance, child) {
  if (child) {
    if (child.isObject3D) parentInstance.add(child)
    else {
      parentInstance.__objects.push(child)

      child.parent = parentInstance // The attach attribute implies that the object attaches itself on the parent

      if (child.attach) parentInstance[child.attach] = child
      else if (child.attachArray) {
        if (!is.arr(parentInstance[child.attachArray])) parentInstance[child.attachArray] = []
        parentInstance[child.attachArray].push(child)
      } else if (child.attachObject) {
        if (!is.obj(parentInstance[child.attachObject[0]])) parentInstance[child.attachObject[0]] = {}
        parentInstance[child.attachObject[0]][child.attachObject[1]] = child
      }
    }
    updateInstance(child)
    invalidateInstance(child)
  }
}

function insertBefore(parentInstance, child, beforeChild) {
  if (child) {
    if (child.isObject3D) {
      child.parent = parentInstance
      child.dispatchEvent({
        type: 'added',
      }) // TODO: the order is out of whack if data objects are present, has to be recalculated

      var index = parentInstance.children.indexOf(beforeChild)
      parentInstance.children = [].concat(
        parentInstance.children.slice(0, index),
        [child],
        parentInstance.children.slice(index)
      )
      updateInstance(child)
    } else appendChild(parentInstance, child) // TODO: order!!!

    invalidateInstance(child)
  }
}

function removeRecursive(array, parent, clone) {
  if (clone === void 0) {
    clone = false
  }

  if (array) {
    // Three uses splice op's internally we may have to shallow-clone the array in order to safely remove items
    var target = clone ? [].concat(array) : array
    target.forEach(function(child) {
      return removeChild(parent, child)
    })
  }
}

function removeChild(parentInstance, child) {
  if (child) {
    if (child.isObject3D) {
      parentInstance.remove(child)
    } else {
      child.parent = null
      parentInstance.__objects = parentInstance.__objects.filter(function(x) {
        return x !== child
      }) // Remove attachment

      if (child.attach) parentInstance[child.attach] = null
      else if (child.attachArray)
        parentInstance[child.attachArray] = parentInstance[child.attachArray].filter(function(x) {
          return x !== child
        })
      else if (child.attachObject) {
        delete parentInstance[child.attachObject[0]][child.attachObject[1]]
      }
    }

    invalidateInstance(child)
    scheduler.unstable_runWithPriority(scheduler.unstable_IdlePriority, function() {
      // Remove interactivity
      if (child.__container)
        child.__container.__interaction = child.__container.__interaction.filter(function(x) {
          return x !== child
        }) // Remove nested child objects

      removeRecursive(child.__objects, child)
      removeRecursive(child.children, child, true) // Dispose item

      if (child.dispose) child.dispose() // Remove references

      delete child.__container
      delete child.__objects
    })
  }
}

function switchInstance(instance, type, newProps, fiber) {
  var parent = instance.parent
  var newInstance = createInstance(type, newProps, instance.__container, null, fiber)
  removeChild(parent, instance)
  appendChild(parent, newInstance) // This evil hack switches the react-internal fiber node
  // https://github.com/facebook/react/issues/14983
  // https://github.com/facebook/react/pull/15021
  ;[fiber, fiber.alternate].forEach(function(fiber) {
    if (fiber !== null) {
      fiber.stateNode = newInstance

      if (fiber.ref) {
        if (typeof fiber.ref === 'function') fiber.ref(newInstance)
        else fiber.ref.current = newInstance
      }
    }
  })
}

var Renderer = Reconciler({
  now: scheduler.unstable_now,
  createInstance: createInstance,
  removeChild: removeChild,
  appendChild: appendChild,
  insertBefore: insertBefore,
  supportsMutation: true,
  isPrimaryRenderer: false,
  // @ts-ignore
  scheduleTimeout: typeof setTimeout === 'function' ? setTimeout : undefined,
  cancelTimeout: typeof clearTimeout === 'function' ? clearTimeout : undefined,
  appendInitialChild: appendChild,
  appendChildToContainer: appendChild,
  removeChildFromContainer: removeChild,
  insertInContainerBefore: insertBefore,
  commitUpdate: function commitUpdate(instance, updatePayload, type, oldProps, newProps, fiber) {
    if (instance.__instance && newProps.object && newProps.object !== instance) {
      // <instance object={...} /> where the object reference has changed
      switchInstance(instance, type, newProps, fiber)
    } else {
      // This is a data object, let's extract critical information about it
      var _newProps$args = newProps.args,
        argsNew = _newProps$args === void 0 ? [] : _newProps$args,
        restNew = _objectWithoutPropertiesLoose(newProps, ['args'])

      var _oldProps$args = oldProps.args,
        argsOld = _oldProps$args === void 0 ? [] : _oldProps$args,
        restOld = _objectWithoutPropertiesLoose(oldProps, ['args']) // If it has new props or arguments, then it needs to be re-instanciated

      var hasNewArgs = argsNew.some(function(value, index) {
        return is.obj(value)
          ? Object.entries(value).some(function(_ref3) {
              var key = _ref3[0],
                val = _ref3[1]
              return val !== argsOld[index][key]
            })
          : value !== argsOld[index]
      })

      if (hasNewArgs) {
        // Next we create a new instance and append it again
        switchInstance(instance, type, newProps, fiber)
      } else {
        // Otherwise just overwrite props
        applyProps(instance, restNew, restOld, true)
      }
    }
  },
  hideInstance: function hideInstance(instance) {
    if (instance.isObject3D) {
      instance.visible = false
      invalidateInstance(instance)
    }
  },
  unhideInstance: function unhideInstance(instance, props) {
    if ((instance.isObject3D && props.visible == null) || props.visible) {
      instance.visible = true
      invalidateInstance(instance)
    }
  },
  getPublicInstance: function getPublicInstance(instance) {
    return instance
  },
  getRootHostContext: function getRootHostContext() {
    return emptyObject
  },
  getChildHostContext: function getChildHostContext() {
    return emptyObject
  },
  createTextInstance: function createTextInstance() {},
  finalizeInitialChildren: function finalizeInitialChildren() {
    return false
  },
  prepareUpdate: function prepareUpdate() {
    return emptyObject
  },
  shouldDeprioritizeSubtree: function shouldDeprioritizeSubtree() {
    return false
  },
  prepareForCommit: function prepareForCommit() {},
  resetAfterCommit: function resetAfterCommit() {},
  shouldSetTextContent: function shouldSetTextContent() {
    return false
  },
})
function render(element, container, state) {
  var root = roots.get(container)

  if (!root) {
    container.__state = state
    var newRoot = (root = Renderer.createContainer(container, false, false))
    roots.set(container, newRoot)
  }

  Renderer.updateContainer(element, root, null, function() {
    return undefined
  })
  return Renderer.getPublicRootInstance(root)
}
function unmountComponentAtNode(container) {
  var root = roots.get(container)
  if (root)
    Renderer.updateContainer(null, root, null, function() {
      return void roots['delete'](container)
    })
}
var hasSymbol = typeof Symbol === 'function' && Symbol['for']
var REACT_PORTAL_TYPE = hasSymbol ? Symbol['for']('react.portal') : 0xeaca
function createPortal(children, containerInfo, implementation, key) {
  if (key === void 0) {
    key = null
  }

  return {
    $$typeof: REACT_PORTAL_TYPE,
    key: key == null ? null : '' + key,
    children: children,
    containerInfo: containerInfo,
    implementation: implementation,
  }
}
Renderer.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  version: version,
  rendererPackageName: 'react-three-fiber',
  findHostInstanceByFiber: Renderer.findHostInstance,
})

function isOrthographicCamera(def) {
  return def.isOrthographicCamera
}

function makeId(event) {
  return (event.eventObject || event.object).uuid + '/' + event.index
}

var stateContext = React.createContext({})
var useCanvas = function useCanvas(props) {
  var children = props.children,
    gl = props.gl,
    camera = props.camera,
    orthographic = props.orthographic,
    raycaster = props.raycaster,
    size = props.size,
    pixelRatio = props.pixelRatio,
    _props$vr = props.vr,
    vr = _props$vr === void 0 ? false : _props$vr,
    _props$shadowMap = props.shadowMap,
    shadowMap = _props$shadowMap === void 0 ? false : _props$shadowMap,
    _props$invalidateFram = props.invalidateFrameloop,
    invalidateFrameloop = _props$invalidateFram === void 0 ? false : _props$invalidateFram,
    _props$updateDefaultC = props.updateDefaultCamera,
    updateDefaultCamera = _props$updateDefaultC === void 0 ? true : _props$updateDefaultC,
    _props$noEvents = props.noEvents,
    noEvents = _props$noEvents === void 0 ? false : _props$noEvents,
    onCreated = props.onCreated,
    onPointerMissed = props.onPointerMissed // Local, reactive state

  var _useState = React.useState(false),
    ready = _useState[0],
    setReady = _useState[1]

  var _useState2 = React.useState(function() {
      return new THREE.Vector2()
    }),
    mouse = _useState2[0]

  var _useState3 = React.useState(function() {
      var ray = new THREE.Raycaster()

      if (raycaster) {
        var filter = raycaster.filter,
          raycasterProps = _objectWithoutPropertiesLoose(raycaster, ['filter'])

        applyProps(ray, raycasterProps, {})
      }

      return ray
    }),
    defaultRaycaster = _useState3[0]

  var _useState4 = React.useState(function() {
      var scene = new THREE.Scene()
      scene.__interaction = []
      scene.__objects = []
      return scene
    }),
    defaultScene = _useState4[0]

  var _useState5 = React.useState(function() {
      var cam = orthographic
        ? new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000)
        : new THREE.PerspectiveCamera(75, 0, 0.1, 1000)
      cam.position.z = 5
      if (camera) applyProps(cam, camera, {})
      return cam
    }),
    defaultCam = _useState5[0],
    _setDefaultCamera = _useState5[1]

  var _useState6 = React.useState(function() {
      return new THREE.Clock()
    }),
    clock = _useState6[0] // Public state

  var state = React.useRef({
    ready: false,
    active: true,
    manual: 0,
    vr: vr,
    noEvents: noEvents,
    invalidateFrameloop: false,
    frames: 0,
    aspect: 0,
    subscribers: [],
    camera: defaultCam,
    scene: defaultScene,
    raycaster: defaultRaycaster,
    mouse: mouse,
    clock: clock,
    gl: gl,
    size: size,
    viewport: {
      width: 0,
      height: 0,
      factor: 0,
    },
    initialClick: [0, 0],
    initialHits: [],
    pointer: new tinyEmitter.TinyEmitter(),
    captured: undefined,
    events: undefined,
    subscribe: function subscribe(ref, priority) {
      if (priority === void 0) {
        priority = 0
      }

      // If this subscription was given a priority, it takes rendering into its own hands
      // For that reason we switch off automatic rendering and increase the manual flag
      // As long as this flag is positive (there could be multiple render subscription)
      // ..there can be no internal rendering at all
      if (priority) state.current.manual++
      state.current.subscribers.push({
        ref: ref,
        priority: priority,
      }) // Sort layers from lowest to highest, meaning, highest priority renders last (on top of the other frames)

      state.current.subscribers = state.current.subscribers.sort(function(a, b) {
        return a.priority - b.priority
      })
      return function() {
        // Decrease manual flag if this subscription had a priority
        if (priority) state.current.manual--
        state.current.subscribers = state.current.subscribers.filter(function(s) {
          return s.ref !== ref
        })
      }
    },
    setDefaultCamera: function setDefaultCamera(camera) {
      return _setDefaultCamera(camera)
    },
    invalidate: function invalidate$1() {
      return invalidate(state)
    },
    intersect: function intersect(event) {
      return handlePointerMove(event || {})
    },
  }) // Writes locals into public state for distribution among subscribers, context, etc

  React.useMemo(
    function() {
      state.current.ready = ready
      state.current.size = size
      state.current.camera = defaultCam
      state.current.invalidateFrameloop = invalidateFrameloop
      state.current.vr = vr
      state.current.gl = gl
      state.current.noEvents = noEvents
    },
    [invalidateFrameloop, vr, noEvents, ready, size, defaultCam, gl]
  ) // Adjusts default camera

  React.useMemo(
    function() {
      state.current.aspect = size.width / size.height

      if (isOrthographicCamera(defaultCam)) {
        state.current.viewport = {
          width: size.width,
          height: size.height,
          factor: 1,
        }
      } else {
        var target = new THREE.Vector3(0, 0, 0)
        var distance = defaultCam.position.distanceTo(target)
        var fov = THREE.Math.degToRad(defaultCam.fov) // convert vertical fov to radians

        var height = 2 * Math.tan(fov / 2) * distance // visible height

        var width = height * state.current.aspect
        state.current.viewport = {
          width: width,
          height: height,
          factor: size.width / width,
        }
      } // #92 (https://github.com/drcmda/react-three-fiber/issues/92)
      // Sometimes automatic default camera adjustment isn't wanted behaviour

      if (updateDefaultCamera) {
        if (isOrthographicCamera(defaultCam)) {
          defaultCam.left = size.width / -2
          defaultCam.right = size.width / 2
          defaultCam.top = size.height / 2
          defaultCam.bottom = size.height / -2
        } else {
          defaultCam.aspect = state.current.aspect
        }

        defaultCam.updateProjectionMatrix() // #178: https://github.com/react-spring/react-three-fiber/issues/178
        // Update matrix world since the renderer is a frame late

        defaultCam.updateMatrixWorld()
      }

      gl.setSize(size.width, size.height)
      if (ready) invalidate(state)
    },
    [defaultCam, size, updateDefaultCamera]
  )
  /** Events ------------------------------------------------------------------------------------------------ */

  /** Sets up defaultRaycaster */

  var prepareRay = React.useCallback(function(_ref) {
    var clientX = _ref.clientX,
      clientY = _ref.clientY

    if (clientX !== void 0) {
      var _state$current$size = state.current.size,
        left = _state$current$size.left,
        right = _state$current$size.right,
        top = _state$current$size.top,
        bottom = _state$current$size.bottom
      mouse.set(((clientX - left) / (right - left)) * 2 - 1, -((clientY - top) / (bottom - top)) * 2 + 1)
      defaultRaycaster.setFromCamera(mouse, state.current.camera)
    }
  }, [])
  /** Intersects interaction objects using the event input */

  var intersect = React.useCallback(function(event, prepare) {
    if (prepare === void 0) {
      prepare = true
    }

    // Skip event handling when noEvents is set
    if (state.current.noEvents) return []
    if (prepare) prepareRay(event)
    var seen = new Set()
    var hits = [] // Intersect known handler objects and filter against duplicates

    var intersects = defaultRaycaster.intersectObjects(state.current.scene.__interaction, true).filter(function(item) {
      var id = makeId(item)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }) // #16031: (https://github.com/mrdoob/three.js/issues/16031)
    // Allow custom userland intersect sort order

    if (raycaster && raycaster.filter && sharedState.current)
      intersects = raycaster.filter(intersects, sharedState.current)

    for (
      var _iterator = intersects,
        _isArray = Array.isArray(_iterator),
        _i = 0,
        _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();
      ;

    ) {
      var _ref2

      if (_isArray) {
        if (_i >= _iterator.length) break
        _ref2 = _iterator[_i++]
      } else {
        _i = _iterator.next()
        if (_i.done) break
        _ref2 = _i.value
      }

      var _intersect = _ref2
      var eventObject = _intersect.object // Bubble event up

      while (eventObject) {
        var handlers = eventObject.__handlers
        if (handlers)
          hits.push(
            _extends({}, _intersect, {
              eventObject: eventObject,
            })
          )
        eventObject = eventObject.parent
      }
    }

    return hits
  }, [])
  /**  Calculates click deltas */

  var calculateDistance = React.useCallback(function(event) {
    var dx = event.clientX - state.current.initialClick[0]
    var dy = event.clientY - state.current.initialClick[1]
    return Math.round(Math.sqrt(dx * dx + dy * dy))
  }, [])
  var hovered = React.useMemo(function() {
    return new Map()
  }, [])
  /**  Handles intersections by forwarding them to handlers */

  var handleIntersects = React.useCallback(function(event, fn) {
    prepareRay(event) // Get fresh intersects

    var hits = intersect(event, false) // If the interaction is captured take that into account, the captured event has to be part of the intersects

    if (state.current.captured && event.type !== 'click' && event.type !== 'wheel') {
      state.current.captured.forEach(function(captured) {
        if (
          !hits.find(function(hit) {
            return hit.eventObject === captured.eventObject
          })
        )
          hits.push(captured)
      })
    } // If anything has been found, forward it to the event listeners

    if (hits.length) {
      var unprojectedPoint = new THREE.Vector3(mouse.x, mouse.y, 0).unproject(state.current.camera)

      var _delta = event.type === 'click' ? calculateDistance(event) : 0

      var _loop = function _loop() {
        if (_isArray2) {
          if (_i2 >= _iterator2.length) return 'break'
          _ref3 = _iterator2[_i2++]
        } else {
          _i2 = _iterator2.next()
          if (_i2.done) return 'break'
          _ref3 = _i2.value
        }

        var hit = _ref3
        var stopped = {
          current: false,
        }

        var raycastEvent = _extends({}, event, {}, hit, {
          stopped: stopped,
          delta: _delta,
          unprojectedPoint: unprojectedPoint,
          ray: defaultRaycaster.ray,
          camera: state.current.camera,
          // Hijack stopPropagation, which just sets a flag
          stopPropagation: function stopPropagation() {
            return (stopped.current = true)
          },
          sourceEvent: event,
        })

        fn(raycastEvent)

        if (stopped.current === true) {
          // Propagation is stopped, remove all other hover records
          // An event handler is only allowed to flush other handlers if it is hovered itself
          if (
            hovered.size &&
            Array.from(hovered.values()).find(function(i) {
              return i.object === hit.object
            })
          ) {
            handlePointerCancel(raycastEvent, [hit])
          }

          return 'break'
        }
      }

      for (
        var _iterator2 = hits,
          _isArray2 = Array.isArray(_iterator2),
          _i2 = 0,
          _iterator2 = _isArray2 ? _iterator2 : _iterator2[Symbol.iterator]();
        ;

      ) {
        var _ref3

        var _ret = _loop()

        if (_ret === 'break') break
      }
    }

    return hits
  }, [])
  var handlePointerMove = React.useCallback(function(event) {
    state.current.pointer.emit('pointerMove', event)
    var hits = handleIntersects(event, function(data) {
      var eventObject = data.eventObject
      var handlers = eventObject.__handlers // Check presence of handlers

      if (!handlers) return // Call mouse move

      if (handlers.pointerMove) handlers.pointerMove(data) // Check if mouse enter or out is present

      if (handlers.pointerOver || handlers.pointerEnter || handlers.pointerOut || handlers.pointerLeave) {
        var id = makeId(data)
        var hoveredItem = hovered.get(id)

        if (!hoveredItem) {
          // If the object wasn't previously hovered, book it and call its handler
          hovered.set(id, data)
          if (handlers.pointerOver)
            handlers.pointerOver(
              _extends({}, data, {
                type: 'pointerover',
              })
            )
          if (handlers.pointerEnter)
            handlers.pointerEnter(
              _extends({}, data, {
                type: 'pointerEnter',
              })
            )
        } else if (hoveredItem.stopped.current) {
          // If the object was previously hovered and stopped, we shouldn't allow other items to proceed
          data.stopPropagation()
        }
      }
    }) // Take care of unhover

    handlePointerCancel(event, hits)
    return hits
  }, [])
  var handlePointerCancel = React.useCallback(function(event, hits) {
    state.current.pointer.emit('pointerCancel', event)
    if (!hits)
      hits = handleIntersects(event, function() {
        return null
      })
    Array.from(hovered.values()).forEach(function(data) {
      // When no objects were hit or the the hovered object wasn't found underneath the cursor
      // we call onPointerOut and delete the object from the hovered-elements map
      if (
        hits &&
        (!hits.length ||
          !hits.find(function(i) {
            return i.eventObject === data.eventObject
          }))
      ) {
        var eventObject = data.eventObject
        var handlers = eventObject.__handlers

        if (handlers) {
          if (handlers.pointerOut)
            handlers.pointerOut(
              _extends({}, data, {
                type: 'pointerout',
              })
            )
          if (handlers.pointerLeave)
            handlers.pointerLeave(
              _extends({}, data, {
                type: 'pointerleave',
              })
            )
        }

        hovered['delete'](makeId(data))
      }
    })
  }, [])
  var handlePointer = React.useCallback(
    function(name) {
      return function(event) {
        state.current.pointer.emit(name, event) // Collect hits

        var hits = handleIntersects(event, function(data) {
          var eventObject = data.eventObject
          var handlers = eventObject.__handlers

          if (handlers && handlers[name]) {
            // Forward all events back to their respective handlers with the exception of click,
            // which must must the initial target
            if (name !== 'click' || state.current.initialHits.includes(eventObject)) handlers[name](data)
          }
        }) // If a click yields no results, pass it back to the user as a miss

        if (name === 'pointerDown') {
          state.current.initialClick = [event.clientX, event.clientY]
          state.current.initialHits = hits.map(function(hit) {
            return hit.eventObject
          })
        }

        if (name === 'click' && !hits.length && onPointerMissed) {
          if (calculateDistance(event) <= 2) onPointerMissed()
        }
      }
    },
    [onPointerMissed]
  )
  React.useMemo(
    function() {
      state.current.events = {
        onClick: handlePointer('click'),
        onWheel: handlePointer('wheel'),
        onPointerDown: handlePointer('pointerDown'),
        onPointerUp: handlePointer('pointerUp'),
        onPointerLeave: function onPointerLeave(e) {
          return handlePointerCancel(e, [])
        },
        onPointerMove: handlePointerMove,
        onGotPointerCapture: function onGotPointerCapture(e) {
          return (state.current.captured = intersect(e, false))
        },
        onLostPointerCapture: function onLostPointerCapture(e) {
          return (state.current.captured = undefined), handlePointerCancel(e)
        },
      }
    },
    [onPointerMissed]
  )
  /** Events ------------------------------------------------------------------------------------------------- */
  // Only trigger the context provider when necessary

  var sharedState = React.useRef()
  React.useMemo(
    function() {
      var _state$current = state.current,
        ready = _state$current.ready,
        manual = _state$current.manual,
        vr = _state$current.vr,
        noEvents = _state$current.noEvents,
        invalidateFrameloop = _state$current.invalidateFrameloop,
        frames = _state$current.frames,
        subscribers = _state$current.subscribers,
        captured = _state$current.captured,
        initialClick = _state$current.initialClick,
        initialHits = _state$current.initialHits,
        props = _objectWithoutPropertiesLoose(_state$current, [
          'ready',
          'manual',
          'vr',
          'noEvents',
          'invalidateFrameloop',
          'frames',
          'subscribers',
          'captured',
          'initialClick',
          'initialHits',
        ])

      sharedState.current = props
    },
    [size, defaultCam]
  ) // Update pixel ratio

  React.useLayoutEffect(
    function() {
      return void (pixelRatio && gl.setPixelRatio(pixelRatio))
    },
    [pixelRatio]
  ) // Update shadowmap

  React.useLayoutEffect(
    function() {
      if (shadowMap) {
        gl.shadowMap.enabled = true
        if (typeof shadowMap === 'object') Object.assign(gl, shadowMap)
        else gl.shadowMap.type = THREE.PCFSoftShadowMap
      }
    },
    [shadowMap]
  ) // This component is a bridge into the three render context, when it gets rendererd
  // we know we are ready to compile shaders, call subscribers, etc

  var IsReady = React.useCallback(function() {
    var activate = function activate() {
      return setReady(true)
    }

    React.useEffect(function() {
      var result = onCreated && onCreated(state.current)
      return void (result && result.then ? result.then(activate) : activate())
    }, [])
    return null
  }, []) // Render v-dom into scene

  React.useLayoutEffect(
    function() {
      render(
        React.createElement(
          stateContext.Provider,
          {
            value: sharedState.current,
          },
          typeof children === 'function' ? children(state.current) : children,
          React.createElement(IsReady, null)
        ),
        defaultScene,
        state
      )
    },
    [ready, children, sharedState.current]
  )
  React.useLayoutEffect(
    function() {
      if (ready) {
        // Start render-loop, either via RAF or setAnimationLoop for VR
        if (!state.current.vr) {
          invalidate(state)
        } else if (gl.vr && gl.setAnimationLoop) {
          gl.vr.enabled = true
          gl.setAnimationLoop(function(t) {
            return renderGl(state, t, 0, true)
          })
        } else console.warn('the gl instance does not support VR!')
      }
    },
    [ready]
  ) // Dispose renderer on unmount

  React.useEffect(function() {
    return function() {
      if (state.current.gl) {
        state.current.gl.forceContextLoss()
        state.current.gl.dispose()
        state.current.gl = undefined
        unmountComponentAtNode(state.current.scene)
        state.current.active = false
      }
    }
  }, [])
  return state.current.events
}

function useFrame(callback, renderPriority) {
  if (renderPriority === void 0) {
    renderPriority = 0
  }

  var _useContext = React.useContext(stateContext),
    subscribe = _useContext.subscribe // Update ref

  var ref = React.useRef(callback)
  React.useLayoutEffect(
    function() {
      return void (ref.current = callback)
    },
    [callback]
  ) // Subscribe/unsub

  React.useEffect(
    function() {
      var unsubscribe = subscribe(ref, renderPriority)
      return function() {
        return unsubscribe()
      }
    },
    [renderPriority]
  )
}
function useRender(callback, takeOver) {
  return useFrame(callback, takeOver ? 1 : 0)
}
function useThree() {
  return React.useContext(stateContext)
}
function useUpdate(callback, dependents, optionalRef) {
  var _useContext2 = React.useContext(stateContext),
    invalidate = _useContext2.invalidate

  var localRef = React.useRef()
  var ref = optionalRef ? optionalRef : localRef
  React.useEffect(function() {
    if (ref.current) {
      callback(ref.current)
      invalidate()
    }
  }, dependents)
  return ref
}
function useResource(optionalRef) {
  var _useState = React.useState(false),
    _ = _useState[0],
    forceUpdate = _useState[1]

  var localRef = React.useRef(undefined)
  var ref = optionalRef ? optionalRef : localRef
  React.useEffect(
    function() {
      return void forceUpdate(function(i) {
        return !i
      })
    },
    [ref.current]
  )
  return [ref, ref.current]
}
var blackList = [
  'id',
  'uuid',
  'type',
  'children',
  'parent',
  'matrix',
  'matrixWorld',
  'matrixWorldNeedsUpdate',
  'modelViewMatrix',
  'normalMatrix',
]

function prune(props) {
  var reducedProps = _extends({}, props) // Remove black listed props

  blackList.forEach(function(name) {
    return delete reducedProps[name]
  }) // Remove functions

  Object.keys(reducedProps).forEach(function(name) {
    return typeof reducedProps[name] === 'function' && delete reducedProps[name]
  }) // Prune materials and geometries

  if (reducedProps.material) reducedProps.material = prune(reducedProps.material)
  if (reducedProps.geometry) reducedProps.geometry = prune(reducedProps.geometry) // Return cleansed object

  return reducedProps
}

function useLoader(Proto, url, extensions) {
  var loader = React.useMemo(
    function() {
      // Construct new loader
      var temp = new Proto() // Run loader extensions

      if (extensions) extensions(temp)
      return temp
    },
    [Proto]
  ) // Use suspense to load async assets

  var results = usePromise(
    function(Proto, url) {
      var urlArray = Array.isArray(url) ? url : [url]
      return Promise.all(
        urlArray.map(function(url) {
          return new Promise(function(res) {
            return loader.load(url, function(data) {
              if (data.scene) {
                var objects = []
                data.scene.traverse(function(props) {
                  return objects.push(prune(props))
                })
                data.__$ = objects
              }

              res(data)
            })
          })
        })
      )
    },
    [Proto, url]
  ) // Dispose objects on unmount

  React.useEffect(function() {
    return function() {
      return results.forEach(function(data) {
        if (data.dispose) data.dispose()
        if (data.scene && data.scene.dispose) data.scene.dispose()
      })
    }
  }, []) // Temporary hack to make the new api backwards compatible for a while ...

  var isArray = Array.isArray(url)

  if (!isArray) {
    var _Object$assign

    Object.assign(
      results[0],
      ((_Object$assign = {}),
      (_Object$assign[Symbol.iterator] = function() {
        console.warn('[value]=useLoader(...) is deprecated, please use value=useLoader(...) instead!')
        return [results[0]][Symbol.iterator]()
      }),
      _Object$assign)
    )
  } // Return the object itself and a list of pruned props

  return isArray ? results : results[0]
}
function useCamera(camera, props) {
  var _useThree = useThree(),
    mouse = _useThree.mouse

  var raycast = React.useMemo(function() {
    var raycaster = new THREE.Raycaster()
    if (props) applyProps(raycaster, props, {})
    var originalRaycast = undefined
    return function(_, intersects) {
      raycaster.setFromCamera(mouse, camera)
      if (!originalRaycast) originalRaycast = this.constructor.prototype.raycast.bind(this)
      if (originalRaycast) originalRaycast(raycaster, intersects)
    }
  }, [])
  return raycast
}

function clientXY(e) {
  e.clientX = e.nativeEvent.pageX
  e.clientY = e.nativeEvent.pageY
  return e
}

var CLICK_DELTA = 20
var styles = {
  flex: 1,
}
var IsReady = React.memo(function(_ref) {
  var gl = _ref.gl,
    props = _objectWithoutPropertiesLoose(_ref, ['gl'])

  var events = useCanvas(
    _extends({}, props, {
      gl: gl,
    })
  )
  var pointerDownCoords = null
  var panResponder = React.useMemo(function() {
    return reactNative.PanResponder.create({
      onStartShouldSetPanResponderCapture: function onStartShouldSetPanResponderCapture(e) {
        events.onGotPointerCapture(clientXY(e))
        return true
      },
      onStartShouldSetPanResponder: function onStartShouldSetPanResponder() {
        return true
      },
      onMoveShouldSetPanResponder: function onMoveShouldSetPanResponder() {
        return true
      },
      onMoveShouldSetPanResponderCapture: function onMoveShouldSetPanResponderCapture() {
        return true
      },
      onPanResponderTerminationRequest: function onPanResponderTerminationRequest() {
        return true
      },
      onPanResponderStart: function onPanResponderStart(e) {
        pointerDownCoords = [e.nativeEvent.locationX, e.nativeEvent.locationY]
        events.onPointerDown(clientXY(e))
      },
      onPanResponderMove: function onPanResponderMove(e) {
        return events.onPointerMove(clientXY(e))
      },
      onPanResponderEnd: function onPanResponderEnd(e) {
        events.onPointerUp(clientXY(e))

        if (pointerDownCoords) {
          var xDelta = pointerDownCoords[0] - e.nativeEvent.locationX
          var yDelta = pointerDownCoords[1] - e.nativeEvent.locationY

          if (Math.sqrt(Math.pow(xDelta, 2) + Math.pow(yDelta, 2)) < CLICK_DELTA) {
            events.onClick(clientXY(e))
          }
        }

        pointerDownCoords = null
      },
      onPanResponderRelease: function onPanResponderRelease(e) {
        return events.onPointerLeave(clientXY(e))
      },
      onPanResponderTerminate: function onPanResponderTerminate(e) {
        return events.onLostPointerCapture(clientXY(e))
      },
      onPanResponderReject: function onPanResponderReject(e) {
        return events.onLostPointerCapture(clientXY(e))
      },
    })
  }, [])
  return React.createElement(
    reactNative.View,
    _extends({}, panResponder.panHandlers, {
      style: reactNative.StyleSheet.absoluteFill,
    })
  )
})
var Canvas = React.memo(function(props) {
  var _useState = React.useState(null),
    size = _useState[0],
    setSize = _useState[1]

  var _useState2 = React.useState(),
    renderer = _useState2[0],
    setRenderer = _useState2[1] // Handle size changes

  var onLayout = function onLayout(e) {
    var _e$nativeEvent$layout = e.nativeEvent.layout,
      x = _e$nativeEvent$layout.x,
      y = _e$nativeEvent$layout.y,
      width = _e$nativeEvent$layout.width,
      height = _e$nativeEvent$layout.height
    setSize({
      x: x,
      y: y,
      width: width,
      height: height,
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
    })
  } // Fired when EXGL context is initialized

  var onContextCreate = function onContextCreate(gl) {
    var pixelRatio, renderer, rendererRender
    return regeneratorRuntime.async(function onContextCreate$(_context) {
      while (1) {
        switch ((_context.prev = _context.next)) {
          case 0:
            if (!props.onContextCreated) {
              _context.next = 3
              break
            }

            _context.next = 3
            return regeneratorRuntime.awrap(props.onContextCreated(gl))

          case 3:
            if (props.shadowMap) {
              // https://github.com/expo/expo-three/issues/38
              gl.createRenderbuffer = function() {
                return {}
              }
            }

            pixelRatio = reactNative.PixelRatio.get()
            renderer = new expoThree.Renderer({
              gl: gl,
              width: size.width / pixelRatio,
              height: size.height / pixelRatio,
              pixelRatio: pixelRatio,
            }) // Bind previous render method to Renderer

            rendererRender = renderer.render.bind(renderer)

            renderer.render = function(scene, camera) {
              rendererRender(scene, camera) // End frame through the RN Bridge

              gl.endFrameEXP()
            }

            setRenderer(renderer)

          case 9:
          case 'end':
            return _context.stop()
        }
      }
    })
  }

  var setNativeRef = function setNativeRef(ref) {
    if (props.nativeRef_EXPERIMENTAL && !props.nativeRef_EXPERIMENTAL.current) {
      props.nativeRef_EXPERIMENTAL.current = ref
    }
  } // 1. Ensure Size
  // 2. Ensure EXGLContext
  // 3. Call `useCanvas`

  return React.createElement(
    reactNative.View,
    {
      onLayout: onLayout,
      style: _extends({}, styles, {}, props.style),
    },
    size &&
      React.createElement(expoGl.GLView, {
        nativeRef_EXPERIMENTAL: setNativeRef,
        onContextCreate: onContextCreate,
        style: reactNative.StyleSheet.absoluteFill,
      }),
    size &&
      renderer &&
      React.createElement(
        IsReady,
        _extends({}, props, {
          size: size,
          gl: renderer,
        })
      )
  )
})

exports.Canvas = Canvas
exports.Renderer = Renderer
exports.addEffect = addEffect
exports.applyProps = applyProps
exports.createPortal = createPortal
exports.extend = extend
exports.invalidate = invalidate
exports.render = render
exports.renderGl = renderGl
exports.unmountComponentAtNode = unmountComponentAtNode
exports.useCamera = useCamera
exports.useFrame = useFrame
exports.useLoader = useLoader
exports.useRender = useRender
exports.useResource = useResource
exports.useThree = useThree
exports.useUpdate = useUpdate
