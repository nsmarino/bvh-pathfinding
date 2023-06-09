import './style.css'
import * as THREE from 'three'
import { renderer, scene } from './core/renderer'
import camera from './core/camera'
import { controls } from './core/orbit-control'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, MeshBVHVisualizer, StaticGeometryGenerator } from "three-mesh-bvh"
import { Pathfinding, PathfindingHelper } from 'three-pathfinding';

import level from '../assets/gltf/updated-navmesh.gltf'

const PATHFINDING = new Pathfinding();
const ZONE = 'level1';
const SPEED = 2
const monsterCount = 10
const maxWanderDistance = 10
const params = {

	displayCollider: false,
	displayBVH: false,
	displayParents: false,
	visualizeDepth: 10,
	gravity: - 9.8,
	physicsSteps: 5,
	// TODO: support steps based on given sphere velocity / radius
	simulationSpeed: 1,
	sphereSize: 1,
	pause: false,
	step: () => {
		const steps = params.physicsSteps;
		for ( let i = 0; i < steps; i ++ ) {
			update( 0.016 / steps );
		}
	},
};

let environment, collider, visualizer;
const spheres = [];
let raycastTarget

const tempSphere = new THREE.Sphere();
const deltaVec = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const forwardVector = new THREE.Vector3( 0, 0, 1 );

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)
const directionalLight = new THREE.DirectionalLight('#ffffff', 1)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(1024, 1024)
directionalLight.shadow.camera.far = 15
directionalLight.shadow.normalBias = 0.05
directionalLight.position.set(0.25, 2, 2.25)
scene.add(directionalLight)

const skyGeo = new THREE.SphereGeometry(1000, 25, 25); 
// const basicSkyMat = new THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
// const loader  = new THREE.TextureLoader()
// const texture = loader.load( "/image.jpeg" );
// const imageSkyMat = new THREE.MeshPhongMaterial({ 
//   map: texture,
// });
const shaderSkyMat = new THREE.ShaderMaterial({
  uniforms: {
    color1: {
      value: new THREE.Color("blue")
    },
    color2: {
      value: new THREE.Color("lightgreen")
    }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color1;
    uniform vec3 color2;
  
    varying vec2 vUv;
    
    void main() {
      
      gl_FragColor = vec4(mix(color1, color2, vUv.y), 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, shaderSkyMat);
sky.material.side = THREE.BackSide;
scene.add(sky);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener( 'pointerup', e => {
//   mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
//   mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
//   raycaster.setFromCamera( mouse, camera );
//   const intersects = raycaster.intersectObjects([raycastTarget], true);
//   if (intersects.length > 0) {
//     const targetGroup = PATHFINDING.getGroup(ZONE, intersects[0].point);
//     const closestNode = PATHFINDING.getClosestNode(intersects[0].point, ZONE, targetGroup)
//     const randomNode = PATHFINDING.getRandomNode(ZONE, targetGroup)
//     const path = PATHFINDING.findPath(closestNode.centroid, randomNode, ZONE, targetGroup);
//     const sphere = createSphere();
//     sphere.position.copy(intersects[0].point)
//     sphere.path = path
    // const HELPER = new PathfindingHelper();
    // scene.add( HELPER );
//     HELPER.setPlayerPosition(intersects[0].point)
//     HELPER.setTargetPosition(randomNode)
//     HELPER.setPath(path)

//     spheres.push(sphere)
//   }
});

function addMonster(startPoint) {
  const sphere = createSphere();

  const targetGroup = PATHFINDING.getGroup(ZONE, startPoint);
  const closestNode = PATHFINDING.getClosestNode(startPoint, ZONE, targetGroup)
  sphere.originNode = closestNode
  
	const randomNode = getWanderTarget(closestNode.centroid, ZONE, targetGroup)
	const path = PATHFINDING.findPath(closestNode.centroid, randomNode, ZONE, targetGroup);

	sphere.position.copy(startPoint)
	sphere.path = path

	sphere.HELPER = new PathfindingHelper();
	scene.add( sphere.HELPER );
	sphere.HELPER.setPlayerPosition(startPoint)
	sphere.HELPER.setTargetPosition(randomNode)
	sphere.HELPER.setPath(path)

  spheres.push(sphere)
}

function getWanderTarget(origin, zone, group) {
  let randomNode = PATHFINDING.getRandomNode(zone, group)
  const distance = origin.distanceTo(randomNode)
  if (distance > maxWanderDistance) {
    randomNode = getWanderTarget(origin, zone, group)
  }
  return randomNode
}

// Update physics and animation
function update( delta ) {
  for (const sphere of spheres) {
    followWanderPath(sphere, delta)
  }
	if ( collider ) {
		const steps = params.physicsSteps;
		for ( let i = 0; i < steps; i ++ ) {
			updateSphereCollisions( delta / steps );
		}
	}
}

async function loadColliderEnvironment() {
  const res = await new GLTFLoader().loadAsync(level)

  // init bvh:
  const geometryMeshes = res.scene.children.filter(child=> child.isMesh && child.userData.gltfExtensions.EXT_collections.collections[0]==="geometry")
  const levelGeometry = new THREE.Scene()
  for (const mesh of geometryMeshes) {
    levelGeometry.add(mesh)
  }
  environment = levelGeometry
	environment.updateMatrixWorld( true );
	const staticGenerator = new StaticGeometryGenerator( environment );
	staticGenerator.attributes = [ 'position' ];
	const mergedGeometry = staticGenerator.generate();
	mergedGeometry.boundsTree = new MeshBVH( mergedGeometry );
	collider = new THREE.Mesh( mergedGeometry );
	collider.material.wireframe = true;
	collider.material.opacity = 1;
	collider.material.transparent = false;

	visualizer = new MeshBVHVisualizer( collider, params.visualizeDepth );
	scene.add( visualizer );
	scene.add( collider );
	scene.add( environment );

  // Add shadows
  environment.traverse( c => {
    if ( c.material ) {
      c.material.color.setHex( 0x000000 );
      c.castShadow = true;
      c.receiveShadow = true;
      c.material.shadowSide = 2;
    }
  });

  // Init navmesh
  const navmesh = res.scene.children.filter(child=> child.isMesh && child.userData.gltfExtensions.EXT_collections.collections[0]==="navmesh")[0]
  PATHFINDING.setZoneData(ZONE, Pathfinding.createZone(navmesh.geometry));

  // VISUALIZE NAVMESH!
  for (const vert of PATHFINDING.zones.level1.vertices) {
    const indicatorSize = 0.2
    const geometry = new THREE.BoxGeometry( indicatorSize,indicatorSize,indicatorSize); 
    const material = new THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
    const cube = new THREE.Mesh( geometry, material ); 
    cube.position.copy(vert)
    scene.add( cube );
  }

  // Visible navmesh:
  scene.add(navmesh)
  navmesh.visible = false
  raycastTarget = navmesh

  const navmeshVertices = PATHFINDING.zones[ZONE].vertices

  // Add wanderers
  for ( let i = 0, l = monsterCount; i < l; i ++ ) {
    const randomPointOnNavmesh = navmeshVertices[Math.floor(Math.random()*navmeshVertices.length)];
    addMonster(randomPointOnNavmesh)
  }
}

function createSphere() {
	const white = new THREE.Color( 0xffffff );
	const color = new THREE.Color( 0x263238 / 2 ).lerp( white, Math.random() * 0.5 + 0.5 ).convertSRGBToLinear();
	const sphere = new THREE.Mesh(
		new THREE.SphereGeometry( 1, 20, 20 ),
		new THREE.MeshStandardMaterial( { color } )
	);
	scene.add( sphere );
	sphere.castShadow = true;
	sphere.receiveShadow = true;
	sphere.material.shadowSide = 2;

	const radius = 0.5 * params.sphereSize * ( Math.random() * .2 + 0.6 );
	sphere.scale.setScalar( radius );
	sphere.collider = new THREE.Sphere( sphere.position, radius );
	sphere.velocity = new THREE.Vector3( 0, 0, 0 );
	sphere.mass = Math.pow( radius, 3 ) * Math.PI * 4 / 3;

  // Add to array that gets checked against for collisions
	// spheres.push( sphere );
	return sphere;

}

function updateSphereCollisions( deltaTime ) {
	// TODO: Add visualization for velocity vector, collision vector, all intersection vectors
	const bvh = collider.geometry.boundsTree;
	for ( let i = 0, l = spheres.length; i < l; i ++ ) {

		const sphere = spheres[ i ];
		const sphereCollider = sphere.collider;

		// move the sphere
		sphere.velocity.y += params.gravity * deltaTime;
		sphereCollider.center.addScaledVector( sphere.velocity, deltaTime );

		// remove the spheres if they've left the world
		if ( sphereCollider.center.y < - 80 ) {
			spheres.splice( i, 1 );
			i --;
			l --;
			sphere.material.dispose();
			sphere.geometry.dispose();
			scene.remove( sphere );
			continue;
		}

		// get the sphere position in world space
		tempSphere.copy( sphere.collider );

		let collided = false;
		bvh.shapecast( {

			intersectsBounds: box => {

				return box.intersectsSphere( tempSphere );

			},

			intersectsTriangle: tri => {
				// get delta between closest point and center
				tri.closestPointToPoint( tempSphere.center, deltaVec );
				deltaVec.sub( tempSphere.center );
				const distance = deltaVec.length();
				if ( distance < tempSphere.radius ) {

					// move the sphere position to be outside the triangle
					const radius = tempSphere.radius;
					const depth = distance - radius;
					deltaVec.multiplyScalar( 1 / distance );
					tempSphere.center.addScaledVector( deltaVec, depth );
					collided = true;
				}
			},

			traverseBoundsOrder: box => {

				return box.distanceToPoint( tempSphere.center ) - tempSphere.radius;

			},

		} );

		if ( collided ) {

		// 	// get the delta direction and reflect the velocity across it
			deltaVec.subVectors( tempSphere.center, sphereCollider.center ).normalize();
			sphere.velocity.reflect( deltaVec );

		  // dampen the velocity and apply some drag
			const dot = sphere.velocity.dot( deltaVec );
			sphere.velocity.addScaledVector( deltaVec, - dot * 0.5 );
			sphere.velocity.multiplyScalar( Math.max( 1.0 - deltaTime, 0 ) );

		  // update the sphere collider position
		  sphereCollider.center.copy( tempSphere.center );
		}

	}

	// Handle sphere collisions
	for ( let i = 0, l = spheres.length; i < l; i ++ ) {

		const s1 = spheres[ i ];
		const c1 = s1.collider;
		for ( let j = i + 1; j < l; j ++ ) {

			const s2 = spheres[ j ];
			const c2 = s2.collider;

			// If they actually intersected
			deltaVec.subVectors( c1.center, c2.center );
			const depth = deltaVec.length() - ( c1.radius + c2.radius );
			if ( depth < 0 ) {

				deltaVec.normalize();

				// get the magnitude of the velocity in the hit direction
				const v1dot = s1.velocity.dot( deltaVec );
				const v2dot = s2.velocity.dot( deltaVec );

				// distribute how much to offset the spheres based on how
				// quickly they were going relative to each other. The ball
				// that was moving should move back the most. Add a max value
				// to avoid jitter.
				const offsetRatio1 = Math.max( v1dot, 0.2 );
				const offsetRatio2 = Math.max( v2dot, 0.2 );

				const total = offsetRatio1 + offsetRatio2;
				const ratio1 = offsetRatio1 / total;
				const ratio2 = offsetRatio2 / total;

				// correct the positioning of the spheres
				c1.center.addScaledVector( deltaVec, - ratio1 * depth );
				c2.center.addScaledVector( deltaVec, ratio2 * depth );

				// Use the momentum formula to adjust velocities
				const velocityDifference = new THREE.Vector3();
				velocityDifference
					.addScaledVector( deltaVec, - v1dot )
					.addScaledVector( deltaVec, v2dot );

				const velDiff = velocityDifference.length();
				const m1 = s1.mass;
				const m2 = s2.mass;

				// Compute new velocities in the moving frame of the sphere that
				// moved into the other.
				let newVel1, newVel2;
				const damping = 0.5;
				if ( velocityDifference.dot( s1.velocity ) > velocityDifference.dot( s2.velocity ) ) {

					newVel1 = damping * velDiff * ( m1 - m2 ) / ( m1 + m2 );
					newVel2 = damping * velDiff * 2 * m1 / ( m1 + m2 );

					// remove any existing relative velocity from the moving sphere
					newVel1 -= velDiff;

				} else {

					newVel1 = damping * velDiff * 2 * m2 / ( m1 + m2 );
					newVel2 = damping * velDiff * ( m2 - m1 ) / ( m1 + m2 );

					// remove any existing relative velocity from the moving sphere
					newVel2 -= velDiff;

				}

				// Apply new velocities
				velocityDifference.normalize();
				s1.velocity.addScaledVector( velocityDifference, newVel1 );
				s2.velocity.addScaledVector( velocityDifference, newVel2 );
			}
		}
		s1.position.copy( c1.center );
	}

}

function followWanderPath(sphere, deltaTime) {
  if ( !sphere.path || !(sphere.path||[]).length ) {
    resetPath(sphere)
    return;
  }

  let targetPosition = sphere.path[ 0 ];
  sphere.velocity = targetPosition.clone().sub( sphere.position );

  if (sphere.velocity.lengthSq() > 0.1) {
    sphere.velocity.normalize();
    // Move to next waypoint
    sphere.position.add( sphere.velocity.multiplyScalar( deltaTime * SPEED ) );
  } else {
    // Remove node from the path we calculated
    sphere.path.shift();
  }
}

function followPursuePath(sphere, destination, deltaTime) {
  // if ( !sphere.path || !(sphere.path||[]).length ) {
  //   console.log("ARRIVED!!!!")
  //   // resetPath(sphere)
  //   return;
  // }
  // const targetGroup = PATHFINDING.getGroup(ZONE, sphere.position);
  // console.log(sphere.position, destination)
  console.log("What goes into findPath", sphere.position, destination, ZONE)
  const path = PATHFINDING.findPath(sphere.position, destination, ZONE, 0);
  console.log("PATH", path)
  if (path) {
    sphere.HELPER.setPlayerPosition(sphere.position)
    sphere.HELPER.setTargetPosition(destination)
    sphere.HELPER.setPath(path)
  }
  // sphere.path = path
  // let targetPosition = sphere.path[ 0 ];
  // sphere.velocity = targetPosition.clone().sub( sphere.position );

  // if (sphere.velocity.lengthSq() > 0.5) {
  //   sphere.velocity.normalize();
  //   // Move to next waypoint
  //   sphere.position.add( sphere.velocity.multiplyScalar( deltaTime * SPEED ) );
  // } else {
  //   // Remove node from the path we calculated
  //   sphere.path.shift();
  // }
}

function resetPath(sphere) {
  const targetGroup = PATHFINDING.getGroup(ZONE, sphere.position);
  if (!sphere.position.x) {
    return
  }
  const closestNode = PATHFINDING.getClosestNode(sphere.position, ZONE, targetGroup)
  const randomNode = getWanderTarget(sphere.originNode.centroid, ZONE, targetGroup)
  const path = PATHFINDING.findPath(closestNode.centroid, randomNode, ZONE, targetGroup);
  sphere.path = path

  // Show only current path:
  sphere.HELPER.setPlayerPosition(sphere.position)
  sphere.HELPER.setTargetPosition(randomNode)
  sphere.HELPER.setPath(path)

  // Show all previous paths as well:
  // const HELPER = new PathfindingHelper();
  // scene.add( HELPER );
  // HELPER.setPlayerPosition(sphere.position)
  // HELPER.setTargetPosition(randomNode)
  // HELPER.setPath(path)
}

const clock = new THREE.Clock()

let player
const init = async () => {
	await loadColliderEnvironment();
  const red = new THREE.Color( 0x880000 );
	player = new THREE.Mesh(
		new THREE.SphereGeometry( 1, 20, 20 ),
		new THREE.MeshStandardMaterial( { color: red } )
	);
  player.node = PATHFINDING.getClosestNode(player.position, ZONE, 0)
  console.log("Player node", player.node)
  // player.position.copy(player.node.centroid)
	scene.add( player );
  for (const sphere of spheres) {
    followPursuePath(sphere, player.node.centroid)
  }

}
const loop = () => {
  controls.update()
  const delta = Math.min( clock.getDelta(), 0.1 );
	if ( collider ) {
			update( params.simulationSpeed * delta );
	}
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
init()
loop()