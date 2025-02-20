import _objectWithoutPropertiesLoose from '@babel/runtime/helpers/esm/objectWithoutPropertiesLoose'
import _extends from '@babel/runtime/helpers/esm/extends'
import * as THREE from 'three'
import {
  Layers,
  Vector2,
  Raycaster,
  Scene,
  OrthographicCamera,
  PerspectiveCamera,
  Clock,
  Vector3,
  Math as Math$1,
  PCFSoftShadowMap,
} from 'three'
import Reconciler from 'react-reconciler'
import { unstable_now, unstable_runWithPriority, unstable_IdlePriority } from 'scheduler'
import {
  createContext,
  useState,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
  useEffect,
  createElement,
  useContext,
  memo,
} from 'react'
import { TinyEmitter } from 'tiny-emitter'
import usePromise from 'react-promise-suspense'
import { GLView } from 'expo-gl'
import { PanResponder, View, StyleSheet, PixelRatio } from 'react-native'
import { Renderer as Renderer$1 } from 'expo-three'

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
const roots = new Map()
const emptyObject = {}
const is = {
  obj: a => a === Object(a),
  str: a => typeof a === 'string',
  num: a => typeof a === 'number',
  und: a => a === void 0,
  arr: a => Array.isArray(a),

  equ(a, b) {
    // Wrong type, doesn't match
    if (typeof a !== typeof b) return false // Atomic, just compare a against b

    if (is.str(a) || is.num(a) || is.obj(a)) return a === b // Array, shallow compare first to see if it's a match

    if (is.arr(a) && a == b) return true // Last resort, go through keys

    let i

    for (i in a) if (!(i in b)) return false

    for (i in b) if (a[i] !== b[i]) return false

    return is.und(i) ? a === b : true
  },
}
let globalEffects = []
function addEffect(callback) {
  globalEffects.push(callback)
}
function renderGl(state, timestamp, repeat = 0, runGlobalEffects = false) {
  // Run global effects
  if (runGlobalEffects) globalEffects.forEach(effect => effect(timestamp) && repeat++) // Run local effects

  const delta = state.current.clock.getDelta()
  state.current.subscribers.forEach(sub => sub.ref.current(state.current, delta)) // Decrease frame count

  state.current.frames = Math.max(0, state.current.frames - 1)
  repeat += !state.current.invalidateFrameloop ? 1 : state.current.frames // Render content

  if (!state.current.manual) state.current.gl.render(state.current.scene, state.current.camera)
  return repeat
}
let running = false

function renderLoop(timestamp) {
  running = true
  let repeat = 0 // Run global effects

  globalEffects.forEach(effect => effect(timestamp) && repeat++)
  roots.forEach(root => {
    const state = root.containerInfo.__state // If the frameloop is invalidated, do not run another frame

    if (state.current.active && state.current.ready && (!state.current.invalidateFrameloop || state.current.frames > 0))
      repeat = renderGl(state, timestamp, repeat)
  })
  if (repeat !== 0) return requestAnimationFrame(renderLoop) // Flag end of operation

  running = false
}

function invalidate(state = true, frames = 2) {
  if (state === true) roots.forEach(root => (root.containerInfo.__state.current.frames = frames))
  else if (state && state.current) {
    if (state.current.vr) return
    state.current.frames = frames
  }

  if (!running) {
    running = true
    requestAnimationFrame(renderLoop)
  }
}
let catalogue = {}
const extend = objects => void (catalogue = _extends({}, catalogue, {}, objects))
function applyProps(instance, newProps, oldProps = {}, accumulative = false) {
  // Filter equals, events and reserved props
  const container = instance.__container
  const sameProps = Object.keys(newProps).filter(key => is.equ(newProps[key], oldProps[key]))
  const handlers = Object.keys(newProps).filter(key => typeof newProps[key] === 'function' && key.startsWith('on'))
  const leftOvers = accumulative ? Object.keys(oldProps).filter(key => newProps[key] === void 0) : []
  const filteredProps = [...sameProps, 'children', 'key', 'ref'].reduce((acc, prop) => {
    let rest = _objectWithoutPropertiesLoose(acc, [prop].map(_toPropertyKey))

    return rest
  }, newProps) // Add left-overs as undefined props so they can be removed

  leftOvers.forEach(key => (filteredProps[key] = undefined))

  if (Object.keys(filteredProps).length > 0) {
    Object.entries(filteredProps).forEach(([key, value]) => {
      if (!handlers.includes(key)) {
        let root = instance
        let target = root[key]

        if (key.includes('-')) {
          const entries = key.split('-')
          target = entries.reduce((acc, key) => acc[key], instance) // If the target is atomic, it forces us to switch the root

          if (!(target && target.set)) {
            const [name, ...reverseEntries] = entries.reverse()
            root = reverseEntries.reverse().reduce((acc, key) => acc[key], instance)
            key = name
          }
        } // Special treatment for objects with support for set/copy

        if (target && target.set && (target.copy || target instanceof Layers)) {
          if (target.copy && target.constructor.name === value.constructor.name) target.copy(value)
          else if (Array.isArray(value)) target.set(...value)
          else target.set(value) // Else, just overwrite the value
        } else root[key] = value

        invalidateInstance(instance)
      }
    }) // Preemptively delete the instance from the containers interaction

    if (accumulative && container && instance.raycast && instance.__handlers) {
      instance.__handlers = undefined

      const index = container.__interaction.indexOf(instance)

      if (index > -1) container.__interaction.splice(index, 1)
    } // Prep interaction handlers

    if (handlers.length) {
      // Add interactive object to central container
      if (container && instance.raycast) {
        // Unless the only onUpdate is the only event present we flag the instance as interactive
        if (!(handlers.length === 1 && handlers[0] === 'onUpdate')) container.__interaction.push(instance)
      } // Add handlers to the instances handler-map

      instance.__handlers = handlers.reduce(
        (acc, key) =>
          _extends({}, acc, {
            [key.charAt(2).toLowerCase() + key.substr(3)]: newProps[key],
          }),
        {}
      )
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

function createInstance(type, _ref, container, hostContext, internalInstanceHandle) {
  let { args = [] } = _ref,
    props = _objectWithoutPropertiesLoose(_ref, ['args'])

  let name = '' + type[0].toUpperCase() + type.slice(1)
  let instance

  if (type === 'primitive') {
    instance = props.object
    instance.__instance = true
  } else if (type === 'new') {
    instance = new props.object(args)
  } else {
    const target = catalogue[name] || THREE[name]
    instance = is.arr(args) ? new target(...args) : new target(args)
  } // Bind to the root container in case portals are being used
  // This is perhaps better for event management as we can keep them on a single instance

  while (container.__container) {
    container = container.__container
  } // TODO: https://github.com/facebook/react/issues/17147
  // If it's still not there it means the portal was created on a virtual node outside of react

  if (!roots.has(container)) {
    const fn = node => {
      if (!node.return) return node.stateNode && node.stateNode.containerInfo
      else return fn(node.return)
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

      const index = parentInstance.children.indexOf(beforeChild)
      parentInstance.children = [
        ...parentInstance.children.slice(0, index),
        child,
        ...parentInstance.children.slice(index),
      ]
      updateInstance(child)
    } else appendChild(parentInstance, child) // TODO: order!!!

    invalidateInstance(child)
  }
}

function removeRecursive(array, parent, clone = false) {
  if (array) {
    // Three uses splice op's internally we may have to shallow-clone the array in order to safely remove items
    const target = clone ? [...array] : array
    target.forEach(child => removeChild(parent, child))
  }
}

function removeChild(parentInstance, child) {
  if (child) {
    if (child.isObject3D) {
      parentInstance.remove(child)
    } else {
      child.parent = null
      parentInstance.__objects = parentInstance.__objects.filter(x => x !== child) // Remove attachment

      if (child.attach) parentInstance[child.attach] = null
      else if (child.attachArray)
        parentInstance[child.attachArray] = parentInstance[child.attachArray].filter(x => x !== child)
      else if (child.attachObject) {
        delete parentInstance[child.attachObject[0]][child.attachObject[1]]
      }
    }

    invalidateInstance(child)
    unstable_runWithPriority(unstable_IdlePriority, () => {
      // Remove interactivity
      if (child.__container) child.__container.__interaction = child.__container.__interaction.filter(x => x !== child) // Remove nested child objects

      removeRecursive(child.__objects, child)
      removeRecursive(child.children, child, true) // Dispose item

      if (child.dispose) child.dispose() // Remove references

      delete child.__container
      delete child.__objects
    })
  }
}

function switchInstance(instance, type, newProps, fiber) {
  const parent = instance.parent
  const newInstance = createInstance(type, newProps, instance.__container, null, fiber)
  removeChild(parent, instance)
  appendChild(parent, newInstance) // This evil hack switches the react-internal fiber node
  // https://github.com/facebook/react/issues/14983
  // https://github.com/facebook/react/pull/15021
  ;[fiber, fiber.alternate].forEach(fiber => {
    if (fiber !== null) {
      fiber.stateNode = newInstance

      if (fiber.ref) {
        if (typeof fiber.ref === 'function') fiber.ref(newInstance)
        else fiber.ref.current = newInstance
      }
    }
  })
}

const Renderer = Reconciler({
  now: unstable_now,
  createInstance,
  removeChild,
  appendChild,
  insertBefore,
  supportsMutation: true,
  isPrimaryRenderer: false,
  // @ts-ignore
  scheduleTimeout: typeof setTimeout === 'function' ? setTimeout : undefined,
  cancelTimeout: typeof clearTimeout === 'function' ? clearTimeout : undefined,
  appendInitialChild: appendChild,
  appendChildToContainer: appendChild,
  removeChildFromContainer: removeChild,
  insertInContainerBefore: insertBefore,

  commitUpdate(instance, updatePayload, type, oldProps, newProps, fiber) {
    if (instance.__instance && newProps.object && newProps.object !== instance) {
      // <instance object={...} /> where the object reference has changed
      switchInstance(instance, type, newProps, fiber)
    } else {
      // This is a data object, let's extract critical information about it
      const { args: argsNew = [] } = newProps,
        restNew = _objectWithoutPropertiesLoose(newProps, ['args'])

      const { args: argsOld = [] } = oldProps,
        restOld = _objectWithoutPropertiesLoose(oldProps, ['args']) // If it has new props or arguments, then it needs to be re-instanciated

      const hasNewArgs = argsNew.some((value, index) =>
        is.obj(value)
          ? Object.entries(value).some(([key, val]) => val !== argsOld[index][key])
          : value !== argsOld[index]
      )

      if (hasNewArgs) {
        // Next we create a new instance and append it again
        switchInstance(instance, type, newProps, fiber)
      } else {
        // Otherwise just overwrite props
        applyProps(instance, restNew, restOld, true)
      }
    }
  },

  hideInstance(instance) {
    if (instance.isObject3D) {
      instance.visible = false
      invalidateInstance(instance)
    }
  },

  unhideInstance(instance, props) {
    if ((instance.isObject3D && props.visible == null) || props.visible) {
      instance.visible = true
      invalidateInstance(instance)
    }
  },

  getPublicInstance(instance) {
    return instance
  },

  getRootHostContext() {
    return emptyObject
  },

  getChildHostContext() {
    return emptyObject
  },

  createTextInstance() {},

  finalizeInitialChildren() {
    return false
  },

  prepareUpdate() {
    return emptyObject
  },

  shouldDeprioritizeSubtree() {
    return false
  },

  prepareForCommit() {},

  resetAfterCommit() {},

  shouldSetTextContent() {
    return false
  },
})
function render(element, container, state) {
  let root = roots.get(container)

  if (!root) {
    container.__state = state
    let newRoot = (root = Renderer.createContainer(container, false, false))
    roots.set(container, newRoot)
  }

  Renderer.updateContainer(element, root, null, () => undefined)
  return Renderer.getPublicRootInstance(root)
}
function unmountComponentAtNode(container) {
  const root = roots.get(container)
  if (root) Renderer.updateContainer(null, root, null, () => void roots.delete(container))
}
const hasSymbol = typeof Symbol === 'function' && Symbol.for
const REACT_PORTAL_TYPE = hasSymbol ? Symbol.for('react.portal') : 0xeaca
function createPortal(children, containerInfo, implementation, key = null) {
  return {
    $$typeof: REACT_PORTAL_TYPE,
    key: key == null ? null : '' + key,
    children,
    containerInfo,
    implementation,
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

const stateContext = createContext({})
const useCanvas = props => {
  const {
    children,
    gl,
    camera,
    orthographic,
    raycaster,
    size,
    pixelRatio,
    vr = false,
    shadowMap = false,
    invalidateFrameloop = false,
    updateDefaultCamera = true,
    noEvents = false,
    onCreated,
    onPointerMissed,
  } = props // Local, reactive state

  const [ready, setReady] = useState(false)
  const [mouse] = useState(() => new Vector2())
  const [defaultRaycaster] = useState(() => {
    const ray = new Raycaster()

    if (raycaster) {
      const raycasterProps = _objectWithoutPropertiesLoose(raycaster, ['filter'])

      applyProps(ray, raycasterProps, {})
    }

    return ray
  })
  const [defaultScene] = useState(() => {
    const scene = new Scene()
    scene.__interaction = []
    scene.__objects = []
    return scene
  })
  const [defaultCam, _setDefaultCamera] = useState(() => {
    const cam = orthographic ? new OrthographicCamera(0, 0, 0, 0, 0.1, 1000) : new PerspectiveCamera(75, 0, 0.1, 1000)
    cam.position.z = 5
    if (camera) applyProps(cam, camera, {})
    return cam
  })
  const [clock] = useState(() => new Clock()) // Public state

  const state = useRef({
    ready: false,
    active: true,
    manual: 0,
    vr,
    noEvents,
    invalidateFrameloop: false,
    frames: 0,
    aspect: 0,
    subscribers: [],
    camera: defaultCam,
    scene: defaultScene,
    raycaster: defaultRaycaster,
    mouse,
    clock,
    gl,
    size,
    viewport: {
      width: 0,
      height: 0,
      factor: 0,
    },
    initialClick: [0, 0],
    initialHits: [],
    pointer: new TinyEmitter(),
    captured: undefined,
    events: undefined,
    subscribe: (ref, priority = 0) => {
      // If this subscription was given a priority, it takes rendering into its own hands
      // For that reason we switch off automatic rendering and increase the manual flag
      // As long as this flag is positive (there could be multiple render subscription)
      // ..there can be no internal rendering at all
      if (priority) state.current.manual++
      state.current.subscribers.push({
        ref,
        priority: priority,
      }) // Sort layers from lowest to highest, meaning, highest priority renders last (on top of the other frames)

      state.current.subscribers = state.current.subscribers.sort((a, b) => a.priority - b.priority)
      return () => {
        // Decrease manual flag if this subscription had a priority
        if (priority) state.current.manual--
        state.current.subscribers = state.current.subscribers.filter(s => s.ref !== ref)
      }
    },
    setDefaultCamera: camera => _setDefaultCamera(camera),
    invalidate: () => invalidate(state),
    intersect: event => handlePointerMove(event || {}),
  }) // Writes locals into public state for distribution among subscribers, context, etc

  useMemo(() => {
    state.current.ready = ready
    state.current.size = size
    state.current.camera = defaultCam
    state.current.invalidateFrameloop = invalidateFrameloop
    state.current.vr = vr
    state.current.gl = gl
    state.current.noEvents = noEvents
  }, [invalidateFrameloop, vr, noEvents, ready, size, defaultCam, gl]) // Adjusts default camera

  useMemo(() => {
    state.current.aspect = size.width / size.height

    if (isOrthographicCamera(defaultCam)) {
      state.current.viewport = {
        width: size.width,
        height: size.height,
        factor: 1,
      }
    } else {
      const target = new Vector3(0, 0, 0)
      const distance = defaultCam.position.distanceTo(target)
      const fov = Math$1.degToRad(defaultCam.fov) // convert vertical fov to radians

      const height = 2 * Math.tan(fov / 2) * distance // visible height

      const width = height * state.current.aspect
      state.current.viewport = {
        width,
        height,
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
  }, [defaultCam, size, updateDefaultCamera])
  /** Events ------------------------------------------------------------------------------------------------ */

  /** Sets up defaultRaycaster */

  const prepareRay = useCallback(({ clientX, clientY }) => {
    if (clientX !== void 0) {
      const { left, right, top, bottom } = state.current.size
      mouse.set(((clientX - left) / (right - left)) * 2 - 1, -((clientY - top) / (bottom - top)) * 2 + 1)
      defaultRaycaster.setFromCamera(mouse, state.current.camera)
    }
  }, [])
  /** Intersects interaction objects using the event input */

  const intersect = useCallback((event, prepare = true) => {
    // Skip event handling when noEvents is set
    if (state.current.noEvents) return []
    if (prepare) prepareRay(event)
    const seen = new Set()
    const hits = [] // Intersect known handler objects and filter against duplicates

    let intersects = defaultRaycaster.intersectObjects(state.current.scene.__interaction, true).filter(item => {
      const id = makeId(item)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }) // #16031: (https://github.com/mrdoob/three.js/issues/16031)
    // Allow custom userland intersect sort order

    if (raycaster && raycaster.filter && sharedState.current)
      intersects = raycaster.filter(intersects, sharedState.current)

    for (let intersect of intersects) {
      let eventObject = intersect.object // Bubble event up

      while (eventObject) {
        const handlers = eventObject.__handlers
        if (handlers)
          hits.push(
            _extends({}, intersect, {
              eventObject,
            })
          )
        eventObject = eventObject.parent
      }
    }

    return hits
  }, [])
  /**  Calculates click deltas */

  const calculateDistance = useCallback(event => {
    let dx = event.clientX - state.current.initialClick[0]
    let dy = event.clientY - state.current.initialClick[1]
    return Math.round(Math.sqrt(dx * dx + dy * dy))
  }, [])
  const hovered = useMemo(() => new Map(), [])
  /**  Handles intersections by forwarding them to handlers */

  const handleIntersects = useCallback((event, fn) => {
    prepareRay(event) // Get fresh intersects

    const hits = intersect(event, false) // If the interaction is captured take that into account, the captured event has to be part of the intersects

    if (state.current.captured && event.type !== 'click' && event.type !== 'wheel') {
      state.current.captured.forEach(captured => {
        if (!hits.find(hit => hit.eventObject === captured.eventObject)) hits.push(captured)
      })
    } // If anything has been found, forward it to the event listeners

    if (hits.length) {
      const unprojectedPoint = new Vector3(mouse.x, mouse.y, 0).unproject(state.current.camera)
      const delta = event.type === 'click' ? calculateDistance(event) : 0

      for (let hit of hits) {
        let stopped = {
          current: false,
        }

        let raycastEvent = _extends({}, event, {}, hit, {
          stopped,
          delta,
          unprojectedPoint,
          ray: defaultRaycaster.ray,
          camera: state.current.camera,
          // Hijack stopPropagation, which just sets a flag
          stopPropagation: () => (stopped.current = true),
          sourceEvent: event,
        })

        fn(raycastEvent)

        if (stopped.current === true) {
          // Propagation is stopped, remove all other hover records
          // An event handler is only allowed to flush other handlers if it is hovered itself
          if (hovered.size && Array.from(hovered.values()).find(i => i.object === hit.object)) {
            handlePointerCancel(raycastEvent, [hit])
          }

          break
        }
      }
    }

    return hits
  }, [])
  const handlePointerMove = useCallback(event => {
    state.current.pointer.emit('pointerMove', event)
    const hits = handleIntersects(event, data => {
      const eventObject = data.eventObject
      const handlers = eventObject.__handlers // Check presence of handlers

      if (!handlers) return // Call mouse move

      if (handlers.pointerMove) handlers.pointerMove(data) // Check if mouse enter or out is present

      if (handlers.pointerOver || handlers.pointerEnter || handlers.pointerOut || handlers.pointerLeave) {
        const id = makeId(data)
        const hoveredItem = hovered.get(id)

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
  const handlePointerCancel = useCallback((event, hits) => {
    state.current.pointer.emit('pointerCancel', event)
    if (!hits) hits = handleIntersects(event, () => null)
    Array.from(hovered.values()).forEach(data => {
      // When no objects were hit or the the hovered object wasn't found underneath the cursor
      // we call onPointerOut and delete the object from the hovered-elements map
      if (hits && (!hits.length || !hits.find(i => i.eventObject === data.eventObject))) {
        const eventObject = data.eventObject
        const handlers = eventObject.__handlers

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

        hovered.delete(makeId(data))
      }
    })
  }, [])
  const handlePointer = useCallback(
    name => event => {
      state.current.pointer.emit(name, event) // Collect hits

      const hits = handleIntersects(event, data => {
        const eventObject = data.eventObject
        const handlers = eventObject.__handlers

        if (handlers && handlers[name]) {
          // Forward all events back to their respective handlers with the exception of click,
          // which must must the initial target
          if (name !== 'click' || state.current.initialHits.includes(eventObject)) handlers[name](data)
        }
      }) // If a click yields no results, pass it back to the user as a miss

      if (name === 'pointerDown') {
        state.current.initialClick = [event.clientX, event.clientY]
        state.current.initialHits = hits.map(hit => hit.eventObject)
      }

      if (name === 'click' && !hits.length && onPointerMissed) {
        if (calculateDistance(event) <= 2) onPointerMissed()
      }
    },
    [onPointerMissed]
  )
  useMemo(() => {
    state.current.events = {
      onClick: handlePointer('click'),
      onWheel: handlePointer('wheel'),
      onPointerDown: handlePointer('pointerDown'),
      onPointerUp: handlePointer('pointerUp'),
      onPointerLeave: e => handlePointerCancel(e, []),
      onPointerMove: handlePointerMove,
      onGotPointerCapture: e => (state.current.captured = intersect(e, false)),
      onLostPointerCapture: e => ((state.current.captured = undefined), handlePointerCancel(e)),
    }
  }, [onPointerMissed])
  /** Events ------------------------------------------------------------------------------------------------- */
  // Only trigger the context provider when necessary

  const sharedState = useRef()
  useMemo(() => {
    const _state$current = state.current,
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
  }, [size, defaultCam]) // Update pixel ratio

  useLayoutEffect(() => void (pixelRatio && gl.setPixelRatio(pixelRatio)), [pixelRatio]) // Update shadowmap

  useLayoutEffect(() => {
    if (shadowMap) {
      gl.shadowMap.enabled = true
      if (typeof shadowMap === 'object') Object.assign(gl, shadowMap)
      else gl.shadowMap.type = PCFSoftShadowMap
    }
  }, [shadowMap]) // This component is a bridge into the three render context, when it gets rendererd
  // we know we are ready to compile shaders, call subscribers, etc

  const IsReady = useCallback(() => {
    const activate = () => setReady(true)

    useEffect(() => {
      const result = onCreated && onCreated(state.current)
      return void (result && result.then ? result.then(activate) : activate())
    }, [])
    return null
  }, []) // Render v-dom into scene

  useLayoutEffect(() => {
    render(
      createElement(
        stateContext.Provider,
        {
          value: sharedState.current,
        },
        typeof children === 'function' ? children(state.current) : children,
        createElement(IsReady, null)
      ),
      defaultScene,
      state
    )
  }, [ready, children, sharedState.current])
  useLayoutEffect(() => {
    if (ready) {
      // Start render-loop, either via RAF or setAnimationLoop for VR
      if (!state.current.vr) {
        invalidate(state)
      } else if (gl.vr && gl.setAnimationLoop) {
        gl.vr.enabled = true
        gl.setAnimationLoop(t => renderGl(state, t, 0, true))
      } else console.warn('the gl instance does not support VR!')
    }
  }, [ready]) // Dispose renderer on unmount

  useEffect(
    () => () => {
      if (state.current.gl) {
        state.current.gl.forceContextLoss()
        state.current.gl.dispose()
        state.current.gl = undefined
        unmountComponentAtNode(state.current.scene)
        state.current.active = false
      }
    },
    []
  )
  return state.current.events
}

function useFrame(callback, renderPriority = 0) {
  const { subscribe } = useContext(stateContext) // Update ref

  const ref = useRef(callback)
  useLayoutEffect(() => void (ref.current = callback), [callback]) // Subscribe/unsub

  useEffect(() => {
    const unsubscribe = subscribe(ref, renderPriority)
    return () => unsubscribe()
  }, [renderPriority])
}
function useRender(callback, takeOver) {
  return useFrame(callback, takeOver ? 1 : 0)
}
function useThree() {
  return useContext(stateContext)
}
function useUpdate(callback, dependents, optionalRef) {
  const { invalidate } = useContext(stateContext)
  const localRef = useRef()
  const ref = optionalRef ? optionalRef : localRef
  useEffect(() => {
    if (ref.current) {
      callback(ref.current)
      invalidate()
    }
  }, dependents)
  return ref
}
function useResource(optionalRef) {
  const [_, forceUpdate] = useState(false)
  const localRef = useRef(undefined)
  const ref = optionalRef ? optionalRef : localRef
  useEffect(() => void forceUpdate(i => !i), [ref.current])
  return [ref, ref.current]
}
const blackList = [
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
  const reducedProps = _extends({}, props) // Remove black listed props

  blackList.forEach(name => delete reducedProps[name]) // Remove functions

  Object.keys(reducedProps).forEach(name => typeof reducedProps[name] === 'function' && delete reducedProps[name]) // Prune materials and geometries

  if (reducedProps.material) reducedProps.material = prune(reducedProps.material)
  if (reducedProps.geometry) reducedProps.geometry = prune(reducedProps.geometry) // Return cleansed object

  return reducedProps
}

function useLoader(Proto, url, extensions) {
  const loader = useMemo(() => {
    // Construct new loader
    const temp = new Proto() // Run loader extensions

    if (extensions) extensions(temp)
    return temp
  }, [Proto]) // Use suspense to load async assets

  const results = usePromise(
    (Proto, url) => {
      const urlArray = Array.isArray(url) ? url : [url]
      return Promise.all(
        urlArray.map(
          url =>
            new Promise(res =>
              loader.load(url, data => {
                if (data.scene) {
                  const objects = []
                  data.scene.traverse(props => objects.push(prune(props)))
                  data.__$ = objects
                }

                res(data)
              })
            )
        )
      )
    },
    [Proto, url]
  ) // Dispose objects on unmount

  useEffect(
    () => () =>
      results.forEach(data => {
        if (data.dispose) data.dispose()
        if (data.scene && data.scene.dispose) data.scene.dispose()
      }),
    []
  ) // Temporary hack to make the new api backwards compatible for a while ...

  const isArray = Array.isArray(url)

  if (!isArray) {
    Object.assign(results[0], {
      [Symbol.iterator]() {
        console.warn('[value]=useLoader(...) is deprecated, please use value=useLoader(...) instead!')
        return [results[0]][Symbol.iterator]()
      },
    })
  } // Return the object itself and a list of pruned props

  return isArray ? results : results[0]
}
function useCamera(camera, props) {
  const { mouse } = useThree()
  const raycast = useMemo(() => {
    let raycaster = new Raycaster()
    if (props) applyProps(raycaster, props, {})
    let originalRaycast = undefined
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

const CLICK_DELTA = 20
const styles = {
  flex: 1,
}
const IsReady = memo(_ref => {
  let { gl } = _ref,
    props = _objectWithoutPropertiesLoose(_ref, ['gl'])

  const events = useCanvas(
    _extends({}, props, {
      gl,
    })
  )
  let pointerDownCoords = null
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture(e) {
          events.onGotPointerCapture(clientXY(e))
          return true
        },

        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => true,
        onPanResponderStart: e => {
          pointerDownCoords = [e.nativeEvent.locationX, e.nativeEvent.locationY]
          events.onPointerDown(clientXY(e))
        },
        onPanResponderMove: e => events.onPointerMove(clientXY(e)),
        onPanResponderEnd: e => {
          events.onPointerUp(clientXY(e))

          if (pointerDownCoords) {
            const xDelta = pointerDownCoords[0] - e.nativeEvent.locationX
            const yDelta = pointerDownCoords[1] - e.nativeEvent.locationY

            if (Math.sqrt(Math.pow(xDelta, 2) + Math.pow(yDelta, 2)) < CLICK_DELTA) {
              events.onClick(clientXY(e))
            }
          }

          pointerDownCoords = null
        },
        onPanResponderRelease: e => events.onPointerLeave(clientXY(e)),
        onPanResponderTerminate: e => events.onLostPointerCapture(clientXY(e)),
        onPanResponderReject: e => events.onLostPointerCapture(clientXY(e)),
      }),
    []
  )
  return createElement(
    View,
    _extends({}, panResponder.panHandlers, {
      style: StyleSheet.absoluteFill,
    })
  )
})
const Canvas = memo(props => {
  const [size, setSize] = useState(null)
  const [renderer, setRenderer] = useState() // Handle size changes

  const onLayout = e => {
    const { x, y, width, height } = e.nativeEvent.layout
    setSize({
      x,
      y,
      width,
      height,
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
    })
  } // Fired when EXGL context is initialized

  const onContextCreate = async gl => {
    if (props.onContextCreated) {
      // Allow customization of the GL Context
      // Useful for AR, VR and others
      await props.onContextCreated(gl)
    }

    if (props.shadowMap) {
      // https://github.com/expo/expo-three/issues/38
      gl.createRenderbuffer = () => ({})
    }

    const pixelRatio = PixelRatio.get()
    const renderer = new Renderer$1({
      gl,
      width: size.width / pixelRatio,
      height: size.height / pixelRatio,
      pixelRatio,
    }) // Bind previous render method to Renderer

    const rendererRender = renderer.render.bind(renderer)

    renderer.render = (scene, camera) => {
      rendererRender(scene, camera) // End frame through the RN Bridge

      gl.endFrameEXP()
    }

    setRenderer(renderer)
  }

  const setNativeRef = ref => {
    if (props.nativeRef_EXPERIMENTAL && !props.nativeRef_EXPERIMENTAL.current) {
      props.nativeRef_EXPERIMENTAL.current = ref
    }
  } // 1. Ensure Size
  // 2. Ensure EXGLContext
  // 3. Call `useCanvas`

  return createElement(
    View,
    {
      onLayout: onLayout,
      style: _extends({}, styles, {}, props.style),
    },
    size &&
      createElement(GLView, {
        nativeRef_EXPERIMENTAL: setNativeRef,
        onContextCreate: onContextCreate,
        style: StyleSheet.absoluteFill,
      }),
    size &&
      renderer &&
      createElement(
        IsReady,
        _extends({}, props, {
          size: size,
          gl: renderer,
        })
      )
  )
})

export {
  Canvas,
  Renderer,
  addEffect,
  applyProps,
  createPortal,
  extend,
  invalidate,
  render,
  renderGl,
  unmountComponentAtNode,
  useCamera,
  useFrame,
  useLoader,
  useRender,
  useResource,
  useThree,
  useUpdate,
}
