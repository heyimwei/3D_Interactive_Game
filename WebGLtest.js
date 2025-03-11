var VSHADER_SOURCE = `
    attribute vec4 a_Position;
    attribute vec4 a_Normal;
    attribute vec2 a_TexCoord;
    uniform mat4 u_MvpMatrix;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_normalMatrix;
    uniform mat4 u_ProjMatrixFromLight;
    uniform mat4 u_MvpMatrixOfLight;
    varying vec4 v_PositionFromLight;
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec2 v_TexCoord;
    void main(){
        gl_Position = u_MvpMatrix * a_Position;
        v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
        v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
        v_PositionFromLight = u_MvpMatrixOfLight * a_Position; //for shadow
        v_TexCoord = a_TexCoord;
    }    
`;

var FSHADER_SOURCE = `
    precision mediump float;
    uniform vec3 u_LightPosition;
    uniform vec3 u_ViewPosition;
    uniform float u_Ka;
    uniform float u_Kd;
    uniform float u_Ks;
    uniform float u_shininess;
    uniform vec3 u_Color;
    uniform sampler2D u_ShadowMap;
    uniform sampler2D u_Sampler0;
    uniform sampler2D u_Sampler1;
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec2 v_TexCoord;
    varying vec4 v_PositionFromLight;
    const float deMachThreshold = 0.005; //0.001 if having high precision depth
    void main(){ 
        vec3 texColor = texture2D( u_Sampler0, v_TexCoord ).rgb;
        vec3 ambientLightColor = texColor;
        vec3 diffuseLightColor = texColor;
        vec3 specularLightColor = vec3(1.0, 1.0, 1.0);        

        vec3 ambient = ambientLightColor * u_Ka;

        vec3 normal = normalize(v_Normal);
        vec3 lightDirection = normalize(u_LightPosition - v_PositionInWorld);
        float nDotL = max(dot(lightDirection, normal), 0.0);
        vec3 diffuse = diffuseLightColor * u_Kd * nDotL;

        vec3 specular = vec3(0.0, 0.0, 0.0);
        if(nDotL > 0.0) {
            vec3 R = reflect(-lightDirection, normal);
            // V: the vector, point to viewer       
            vec3 V = normalize(u_ViewPosition - v_PositionInWorld); 
            float specAngle = clamp(dot(R, V), 0.0, 1.0);
            specular = u_Ks * pow(specAngle, u_shininess) * specularLightColor; 
        }

        //***** shadow
        vec3 shadowCoord = (v_PositionFromLight.xyz/v_PositionFromLight.w)/2.0 + 0.5;
        vec4 rgbaDepth = texture2D(u_ShadowMap, shadowCoord.xy);
        /////////******** LOW precision depth implementation ********///////////
        float depth = rgbaDepth.r;
        float visibility = (shadowCoord.z > depth + deMachThreshold) ? 0.3 : 1.0;

        gl_FragColor = vec4( (ambient + diffuse + specular)*visibility, 1.0);
        
    }
`;

var VSHADER_SHADOW_SOURCE = `
      attribute vec4 a_Position;
      uniform mat4 u_MvpMatrix;
      void main(){
          gl_Position = u_MvpMatrix * a_Position;
      }
  `;

var FSHADER_SHADOW_SOURCE = `
      precision mediump float;
      void main(){
        /////////** LOW precision depth implementation **/////
        gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
      }
  `;

var VSHADER_SOURCE_TEXTURE_ON_CUBE = `
  attribute vec4 a_Position;
  attribute vec4 a_Normal;
  uniform mat4 u_MvpMatrix;
  uniform mat4 u_modelMatrix;
  uniform mat4 u_normalMatrix;
  varying vec4 v_TexCoord;
  varying vec3 v_Normal;
  varying vec3 v_PositionInWorld;
  void main() {
    gl_Position = u_MvpMatrix * a_Position;
    v_TexCoord = a_Position;
    v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
    v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
  } 
`;

var FSHADER_SOURCE_TEXTURE_ON_CUBE = `
  precision mediump float;
  varying vec4 v_TexCoord;
  uniform vec3 u_ViewPosition;
  uniform vec3 u_Color;
  uniform samplerCube u_envCubeMap;
  varying vec3 v_Normal;
  varying vec3 v_PositionInWorld;
  void main() {
    vec3 V = normalize(u_ViewPosition - v_PositionInWorld); 
    vec3 normal = normalize(v_Normal);
    vec3 R = reflect(-V, normal);
    gl_FragColor = vec4(0.78 * textureCube(u_envCubeMap, R).rgb + 0.3 * u_Color, 1.0);
  }
`;

var VSHADER_SOURCE_ENVCUBE = `
  attribute vec4 a_Position;
  varying vec4 v_Position;
  void main() {
    v_Position = a_Position;
    gl_Position = a_Position;
  } 
`;

var FSHADER_SOURCE_ENVCUBE = `
  precision mediump float;
  uniform samplerCube u_envCubeMap;
  uniform mat4 u_viewDirectionProjectionInverse;
  varying vec4 v_Position;
  void main() {
    vec4 t = u_viewDirectionProjectionInverse * v_Position;
    gl_FragColor = textureCube(u_envCubeMap, normalize(t.xyz / t.w));
  }
`;

function compileShader(gl, vShaderText, fShaderText){
    //////Build vertex and fragment shader objects
    var vertexShader = gl.createShader(gl.VERTEX_SHADER)
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    //The way to  set up shader text source
    gl.shaderSource(vertexShader, vShaderText)
    gl.shaderSource(fragmentShader, fShaderText)
    //compile vertex shader
    gl.compileShader(vertexShader)
    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)){
        console.log('vertex shader ereror');
        var message = gl.getShaderInfoLog(vertexShader); 
        console.log(message);//print shader compiling error message
    }
    //compile fragment shader
    gl.compileShader(fragmentShader)
    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)){
        console.log('fragment shader ereror');
        var message = gl.getShaderInfoLog(fragmentShader);
        console.log(message);//print shader compiling error message
    }

    /////link shader to program (by a self-define function)
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    //if not success, log the program info, and delete it.
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
        alert(gl.getProgramInfoLog(program) + "");
        gl.deleteProgram(program);
    }

    return program;
}

/////BEGIN:///////////////////////////////////////////////////////////////////////////////////////////////
/////The folloing three function is for creating vertex buffer, but link to shader to user later//////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////
function initAttributeVariable(gl, a_attribute, buffer){
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(a_attribute, buffer.num, buffer.type, false, 0, 0);
  gl.enableVertexAttribArray(a_attribute);
}

function initArrayBufferForLaterUse(gl, data, num, type) {
  // Create a buffer object
  var buffer = gl.createBuffer();
  if (!buffer) {
    console.log('Failed to create the buffer object');
    return null;
  }
  // Write date into the buffer object
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // Store the necessary information to assign the object to the attribute variable later
  buffer.num = num;
  buffer.type = type;

  return buffer;
}

function initVertexBufferForLaterUse(gl, vertices, normals, texCoords){
  var nVertices = vertices.length / 3;

  var o = new Object();
  o.vertexBuffer = initArrayBufferForLaterUse(gl, new Float32Array(vertices), 3, gl.FLOAT);
  if( normals != null ) o.normalBuffer = initArrayBufferForLaterUse(gl, new Float32Array(normals), 3, gl.FLOAT);
  if( texCoords != null ) o.texCoordBuffer = initArrayBufferForLaterUse(gl, new Float32Array(texCoords), 2, gl.FLOAT);
  //you can have error check here
  o.numVertices = nVertices;

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return o;
}
/////END://///////////////////////////////////////////////////////////////////////////////////////////////
/////The folloing three function is for creating vertex buffer, but link to shader to user later//////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////

var mouseLastX, mouseLastY;
var mouseDragging = false;
var angleX = 0, angleY = 0;
var gl, canvas;
var modelMatrix;
var normalMatrix;
var nVertex;
var cameraX = 0, cameraY = 2, cameraZ = 7;
var cameraDirX = 0, cameraDirY = 0, cameraDirZ = -1;
var lookmode = 1;
var lightX = 0, lightY = 15, lightZ = 1;
var cubeMapTex;
var cubeObj;
var quadObj;
var sphereObj;
var marioObj;
var sonicObj;
var garageObj;
var pumpkinObj;
var plantObj;
var leafObj;
var toolsObj;
var farmerObj;
var bagObj;
var canObj;
var wellObj;
var cartObj;
var bagonhandObj;
var rotateAngle = 0;
var texCount = 0;
var fbo;
var textures = {};
var numTextures = 1; 
var offScreenWidth = 256, offScreenHeight = 256; //for cubemap render
var can_on_hand = 0;
var seed_on_hand = 0;
var fert_on_hand = 0;
var plant_on_hand = 0;
var distance_can = 20;
var distance_seed = 20;
var distance_fert = 20;
var distance_plant = 20;
var distance_well = 20;
var distance_cart = 20;
var plant_level = 0;
var water_filled = 0;
var money = 0;
var end = 0;
var cart_angle = -15;
var cart_angle2 = 0;
var Cart_x = 8;
var Cart_z = 10;

async function main(){
    canvas = document.getElementById('webgl');
    gl = canvas.getContext('webgl2');
    if(!gl){
        console.log('Failed to get the rendering context for WebGL');
        return ;
    }

    //setup shaders and prepare shader variables
    shadowProgram = compileShader(gl, VSHADER_SHADOW_SOURCE, FSHADER_SHADOW_SOURCE);
    shadowProgram.a_Position = gl.getAttribLocation(shadowProgram, 'a_Position');
    shadowProgram.u_MvpMatrix = gl.getUniformLocation(shadowProgram, 'u_MvpMatrix');

    sphereObj = await loadOBJtoCreateVBO('sphere.obj');
    sonicObj = await loadOBJtoCreateVBO('sonic.obj');
    marioObj = await loadOBJtoCreateVBO('mario.obj');
    cubeObj = await loadOBJtoCreateVBO('cube.obj');
    garageObj = await loadOBJtoCreateVBO('garage.obj');
    // quadObj = await loadOBJtoCreateVBO('quad.obj');
    pumpkinObj = await loadOBJtoCreateVBO('pumpkin.obj');
    plantObj = await loadOBJtoCreateVBO('plant.obj');
    leafObj = await loadOBJtoCreateVBO('leaf.obj');
    toolsObj = await loadOBJtoCreateVBO('tools.obj');
    farmerObj = await loadOBJtoCreateVBO('workermanOBJ.obj');
    bagObj = await loadOBJtoCreateVBO('Barrier.obj');
    canObj = await loadOBJtoCreateVBO('wateringCan.obj');
    wellObj = await loadOBJtoCreateVBO('Well.obj');
    cartObj = await loadOBJtoCreateVBO('Cart.obj');
    bagonhandObj = await loadOBJtoCreateVBO('hanging_package.obj');

    program = compileShader(gl, VSHADER_SOURCE, FSHADER_SOURCE);
    program.a_Position = gl.getAttribLocation(program, 'a_Position'); 
    program.a_Normal = gl.getAttribLocation(program, 'a_Normal'); 
    program.a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord'); 
    program.u_MvpMatrix = gl.getUniformLocation(program, 'u_MvpMatrix'); 
    program.u_modelMatrix = gl.getUniformLocation(program, 'u_modelMatrix'); 
    program.u_normalMatrix = gl.getUniformLocation(program, 'u_normalMatrix');
    program.u_LightPosition = gl.getUniformLocation(program, 'u_LightPosition');
    program.u_ViewPosition = gl.getUniformLocation(program, 'u_ViewPosition');
    program.u_MvpMatrixOfLight = gl.getUniformLocation(program, 'u_MvpMatrixOfLight');
    program.u_Ka = gl.getUniformLocation(program, 'u_Ka'); 
    program.u_Kd = gl.getUniformLocation(program, 'u_Kd');
    program.u_Ks = gl.getUniformLocation(program, 'u_Ks');
    program.u_Color = gl.getUniformLocation(program, 'u_Color');
    program.u_shininess = gl.getUniformLocation(program, 'u_shininess');
    program.u_Sampler0 = gl.getUniformLocation(program, "u_Sampler0");
    program.u_ShadowMap = gl.getUniformLocation(program, "u_ShadowMap");

    programTextureOnCube = compileShader(gl, VSHADER_SOURCE_TEXTURE_ON_CUBE, FSHADER_SOURCE_TEXTURE_ON_CUBE);
    programTextureOnCube.a_Position = gl.getAttribLocation(programTextureOnCube, 'a_Position'); 
    programTextureOnCube.a_Normal = gl.getAttribLocation(programTextureOnCube, 'a_Normal'); 
    programTextureOnCube.u_MvpMatrix = gl.getUniformLocation(programTextureOnCube, 'u_MvpMatrix'); 
    programTextureOnCube.u_modelMatrix = gl.getUniformLocation(programTextureOnCube, 'u_modelMatrix'); 
    programTextureOnCube.u_normalMatrix = gl.getUniformLocation(programTextureOnCube, 'u_normalMatrix');
    programTextureOnCube.u_ViewPosition = gl.getUniformLocation(programTextureOnCube, 'u_ViewPosition');
    programTextureOnCube.u_envCubeMap = gl.getUniformLocation(programTextureOnCube, 'u_envCubeMap'); 
    programTextureOnCube.u_Color = gl.getUniformLocation(programTextureOnCube, 'u_Color'); 

    // gl.useProgram(program);

    fbo = initFrameBuffer(gl);

    // draw();
    
    programEnvCube = compileShader(gl, VSHADER_SOURCE_ENVCUBE, FSHADER_SOURCE_ENVCUBE);
    programEnvCube.a_Position = gl.getAttribLocation(programEnvCube, 'a_Position'); 
    programEnvCube.u_envCubeMap = gl.getUniformLocation(programEnvCube, 'u_envCubeMap'); 
    programEnvCube.u_viewDirectionProjectionInverse = gl.getUniformLocation(programEnvCube, 'u_viewDirectionProjectionInverse');
    

    //
    let imageSteel = new Image();
    imageSteel.onload = function(){initTexture(gl, imageSteel, "steelTex");};
    imageSteel.src = "steel.jpg";
    //
    let imageWood = new Image();
    imageWood.onload = function(){initTexture(gl, imageWood,"woodTex");};
    imageWood.src = "wood.jpg"
    //
    let imageTrack = new Image();
    imageTrack.onload = function(){initTexture(gl, imageTrack,"trackTex");};
    imageTrack.src = "track.jpg"    
    //
    let imageField = new Image();
    imageField.onload = function(){initTexture(gl, imageField,"fieldTex");};
    imageField.src = "field.jpg"        
    //
    let imageSoil = new Image();
    imageSoil.onload = function(){initTexture(gl, imageSoil,"soilTex");};
    imageSoil.src = "soil.jpg"         
    //
    let imageBag = new Image();
    imageBag.onload = function(){initTexture(gl, imageBag,"bagTex");};
    imageBag.src = "bag.jpg"         
    //
    let imagePumpkin = new Image();
    imagePumpkin.onload = function(){initTexture(gl, imagePumpkin,"pumpkinTex");};
    imagePumpkin.src = "pumpkin.jpg"      
    //
    let imagePlant = new Image();
    imagePlant.onload = function(){initTexture(gl, imagePlant,"plantTex");};
    imagePlant.src = "plant.jpg"      
    //
    let imageLeaf = new Image();
    imageLeaf.onload = function(){initTexture(gl, imageLeaf,"leafTex");};
    imageLeaf.src = "leaf.jpg"         
    //
    let imageCan = new Image();
    imageCan.onload = function(){initTexture(gl, imageCan,"canTex");};
    imageCan.src = "can.png"          
    //
    let imageRock = new Image();
    imageRock.onload = function(){initTexture(gl, imageRock,"rockTex");};
    imageRock.src = "rock.jpg"           
    //
    let imageFertilizer = new Image();
    imageFertilizer.onload = function(){initTexture(gl, imageFertilizer,"fertTex");};
    imageFertilizer.src = "fert.jpg"        
    //
    let imageSkin = new Image();
    imageSkin.onload = function(){initTexture(gl, imageSkin,"skinTex");};
    imageSkin.src = "skin.jpg"           
    //
    let imageSkin2 = new Image();
    imageSkin2.onload = function(){initTexture(gl, imageSkin2,"skin2Tex");};
    imageSkin2.src = "skin_dark.jpg"  
    //

    cubeMapTex = initCubeTexture("pos-x.jpg", "neg-x.jpg", "pos-y.jpg", "neg-y.jpg", 
                                      "pos-z.jpg", "neg-z.jpg", 2048, 2048)

    var quad = new Float32Array(
      [
        -1, -1, 1,
          1, -1, 1,
        -1,  1, 1,
        -1,  1, 1,
          1, -1, 1,
          1,  1, 1
      ]); //just a quad

    quadObj = initVertexBufferForLaterUse(gl, quad);

    fbo2 = initFrameBufferForCubemapRendering(gl);

    canvas.onmousedown = function(ev){mouseDown(ev)};
    canvas.onmousemove = function(ev){mouseMove(ev)};
    canvas.onmouseup = function(ev){mouseUp(ev)};
    document.onkeydown = function(ev){keydown(ev)};

    var tick = function() {
      // rotateAngle += 0.45;
      draw();
      requestAnimationFrame(tick);
      
      const status = document.getElementById('status');
      console.log(status.textContent);
      status.textContent = "收成 :" + money;
      if(money == 2){
        status.textContent = "收穫滿滿! 按 Q 賣出南瓜";
      }
      if(end == 1 && cart_angle < 0){
        cart_angle += 0.1;
      }
      if(cart_angle >= 0 && cart_angle2 != 90){
        cart_angle2 += 1;
      }
      if(cart_angle2 == 90 && Cart_x <= 20){
        Cart_x += 0.1;
      }
      if(Cart_x >= 20){
        status.textContent = "成功! 遊戲結束~";
      }
    }
    tick();

}

var vpFromCameraInverse = new Matrix4();

function draw(){
  ///// off screen shadow
  gl.useProgram(shadowProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, offScreenWidth, offScreenHeight);
  gl.clearColor(0.0, 0.0, 0.0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  //cube
  let cubeMdlMatrix = new Matrix4();
  cubeMdlMatrix.setTranslate(0.0, 0.0, 0.0);
  cubeMdlMatrix.scale(20, 0.2, 20);
  let cubeMvpFromLight = drawOffScreen(cubeObj, cubeMdlMatrix);
  //cube2
  let cube2MdlMatrix = new Matrix4();
  cube2MdlMatrix.setTranslate(0.0, 0.0, 0.0);
  cube2MdlMatrix.scale(0.2, 3, 0.2);
  let cube2MvpFromLight = drawOffScreen(cubeObj, cube2MdlMatrix);
  //soil
  let soilMdlMatrix = new Matrix4();
  soilMdlMatrix.setTranslate(-5.0, 0.2, -5.0);
  soilMdlMatrix.scale(3, 0.1, 3);
  let soilMvpFromLight = drawOffScreen(cubeObj, soilMdlMatrix);
  //soil2
  let soil2MdlMatrix = new Matrix4();
  soil2MdlMatrix.setTranslate(-13.0, 0.2, -5.0);
  soil2MdlMatrix.scale(3, 0.1, 3);
  let soil2MvpFromLight = drawOffScreen(cubeObj, soil2MdlMatrix);
  //soil3
  let soil3MdlMatrix = new Matrix4();
  soil3MdlMatrix.setTranslate(-5.0, 0.2, -13.0);
  soil3MdlMatrix.scale(3, 0.1, 3);
  let soil3MvpFromLight = drawOffScreen(cubeObj, soil3MdlMatrix);
  //soil4
  let soil4MdlMatrix = new Matrix4();
  soil4MdlMatrix.setTranslate(-13.0, 0.2, -13.0);
  soil4MdlMatrix.scale(3, 0.1, 3);
  let soil4MvpFromLight = drawOffScreen(cubeObj, soil4MdlMatrix);
  //road
  let roadMdlMatrix = new Matrix4();
  roadMdlMatrix.setTranslate(0.0, 0.11, 16.0);
  roadMdlMatrix.scale(20, 0.1, 4);
  let roadMvpFromLight = drawOffScreen(cubeObj, roadMdlMatrix);
  //road2
  let road2MdlMatrix = new Matrix4();
  road2MdlMatrix.setTranslate(0.0, 0.11, 8.0);
  road2MdlMatrix.scale(2.5, 0.1, 4);
  let road2MvpFromLight = drawOffScreen(cubeObj, road2MdlMatrix);
  //mario
  let marioMdlMatrix = new Matrix4();
  marioMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  marioMdlMatrix.translate(4, 2.4, -7.5);
  marioMdlMatrix.scale(1.8, 1.5, 1.8);
  let marioMvpFromLight = drawOffScreen(farmerObj, marioMdlMatrix);
  //sonic
  let sonicMdlMatrix = new Matrix4();
  sonicMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  sonicMdlMatrix.translate(0.0, 1.7, -7.5);
  sonicMdlMatrix.scale(2.0, 1.0,2.0);
  let sonicMvpFromLight = drawOffScreen(farmerObj, sonicMdlMatrix);
  //garage
  let garageMdlMatrix = new Matrix4();
  garageMdlMatrix.setTranslate(12.0, 0.0, -7.0);
  garageMdlMatrix.rotate(rotateAngle-90, 0, 1, 0);
  garageMdlMatrix.scale(1.2, 0.9,1.2);
  let garageMvpFromLight = drawOffScreen(garageObj, garageMdlMatrix);


  //farmer
  let farmerMdlMatrix = new Matrix4();
  if(lookmode == 1){
    farmerMdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
  }else{
    farmerMdlMatrix.setTranslate(cameraX, cameraY-3, cameraZ);
  }
  // console.log("farmer",farmerMdlMatrix.elements[12],farmerMdlMatrix.elements[13],farmerMdlMatrix.elements[14]);
  farmerMdlMatrix.rotate(180, 0, 1, 0);
  farmerMdlMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  farmerMdlMatrix.scale(1.8, 1.2, 1.8);
  let farmerMvpFromLight = drawOffScreen(farmerObj, farmerMdlMatrix);

  //can on hand
  let canonhandMdlMatrix;
  let canonhandMvpFromLight;
  if(can_on_hand==1){
    canonhandMdlMatrix = new Matrix4();
    canonhandMdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    canonhandMdlMatrix.translate(0.4, -0.5, -1.0);
    canonhandMdlMatrix.rotate(-90, 0, 1, 0);
    canonhandMdlMatrix.scale(0.0015, 0.001,0.0015);
    canonhandMvpFromLight = drawOffScreen(canObj, canonhandMdlMatrix);
  }
  //seed on hand seedonhand
  let seedonhandMdlMatrix;
  let seedonhandMvpFromLight;
  if(seed_on_hand==1){
    seedonhandMdlMatrix = new Matrix4();
    seedonhandMdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    seedonhandMdlMatrix.translate(0.2, -0.5, -0.8);
    seedonhandMdlMatrix.rotate(-90, 0, 1, 0);
    seedonhandMdlMatrix.rotate(-90, 1, 0, 0);
    seedonhandMdlMatrix.scale(0.02, 0.02,0.02);
    seedonhandMvpFromLight = drawOffScreen(bagonhandObj, seedonhandMdlMatrix);
  }
  //fert on hand fertonhand
  let fertonhandMdlMatrix;
  let fertonhandMvpFromLight;
  if(fert_on_hand==1){
    fertonhandMdlMatrix = new Matrix4();
    fertonhandMdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    fertonhandMdlMatrix.translate(0.2, -0.5, -0.8);
    fertonhandMdlMatrix.rotate(-90, 0, 1, 0);
    fertonhandMdlMatrix.rotate(-90, 1, 0, 0);
    fertonhandMdlMatrix.scale(0.02, 0.02,0.02);
    fertonhandMvpFromLight = drawOffScreen(bagonhandObj, fertonhandMdlMatrix);
  }
  //plant on hand plantonhand
  let plantonhandMdlMatrix;
  let plantonhandMvpFromLight;
  if(plant_on_hand==1){
    plantonhandMdlMatrix = new Matrix4();
    plantonhandMdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    plantonhandMdlMatrix.translate(0.45, -0.8, -1.0);
    plantonhandMdlMatrix.rotate(0, 0, 1, 0);
    plantonhandMdlMatrix.scale(0.15, 0.15, 0.15);
    plantonhandMvpFromLight = drawOffScreen(pumpkinObj, plantonhandMdlMatrix);
  }
  


  //tools
  let toolsMdlMatrix = new Matrix4();
  toolsMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  toolsMdlMatrix.translate(13, 0.0, -7);
  toolsMdlMatrix.scale(0.2, 0.2,0.2);
  let toolsMvpFromLight = drawOffScreen(toolsObj, toolsMdlMatrix);
  //bag
  let bagMdlMatrix = new Matrix4();
  bagMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  bagMdlMatrix.translate(4.0, 0.3, -6);
  bagMdlMatrix.scale(1, 1,1);
  let bagMvpFromLight = drawOffScreen(bagObj, bagMdlMatrix);
  //fertilizer
  let fertMdlMatrix = new Matrix4();
  fertMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  fertMdlMatrix.translate(0.0, 0.3, -6);
  fertMdlMatrix.scale(1, 1,1);
  let fertMvpFromLight = drawOffScreen(bagObj, fertMdlMatrix);
  //can
  let canMdlMatrix = new Matrix4();
  canMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  canMdlMatrix.translate(15, 0.5, -5);
  // console.log("can",canMdlMatrix.elements[12],canMdlMatrix.elements[13],canMdlMatrix.elements[14]);
  canMdlMatrix.scale(0.0015, 0.001,0.0015);
  let canMvpFromLight = drawOffScreen(canObj, canMdlMatrix);
  //well
  let wellMdlMatrix = new Matrix4();
  wellMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  wellMdlMatrix.translate(-6, 0.3, 6);
  wellMdlMatrix.scale(1, 1,1);
  let wellMvpFromLight = drawOffScreen(wellObj, wellMdlMatrix);

  //plant
  //3
  let pumpkinMdlMatrix = new Matrix4();
  pumpkinMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  pumpkinMdlMatrix.translate(-4.9, 0.3, -4.9);
  pumpkinMdlMatrix.scale(0.2, 0.2, 0.2);
  let pumpkinMvpFromLight;
  //2
  let plantMdlMatrix = new Matrix4();
  plantMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  plantMdlMatrix.translate(-5.1, 0.3, -5.1);
  plantMdlMatrix.scale(0.25, 0.25, 0.25);
  let plantMvpFromLight;
  //1
  let leafMdlMatrix = new Matrix4();
  leafMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  leafMdlMatrix.translate(-5.0, 0.3, -5);
  leafMdlMatrix.scale(0.005, 0.005, 0.005);
  let leafMvpFromLight;
  if(plant_level == 0){

  }else if(plant_level == 1){
    //1
    leafMvpFromLight = drawOffScreen(plantObj, leafMdlMatrix);
  }else if(plant_level == 2){
    //2
    plantMvpFromLight = drawOffScreen(plantObj, plantMdlMatrix);
  }else if(plant_level == 3){
    //pumpkin
    pumpkinMvpFromLight = drawOffScreen(pumpkinObj, pumpkinMdlMatrix);
  }

  
  //cart
  let cartMdlMatrix = new Matrix4();
  cartMdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  cartMdlMatrix.translate(Cart_x, 1.1, Cart_z);
  cartMdlMatrix.rotate(cart_angle2, 0, 1, 0);
  cartMdlMatrix.rotate(cart_angle, 1, 0, 0);
  cartMdlMatrix.scale(0.03, 0.03,0.03);
  let cartMvpFromLight = drawOffScreen(cartObj, cartMdlMatrix);

  //pumpkin2
  let pumpkinMdlMatrix2 = new Matrix4();
  pumpkinMdlMatrix2.setRotate(rotateAngle, 0, 1, 0);
  pumpkinMdlMatrix2.translate(Cart_x, 1.6, Cart_z);
  pumpkinMdlMatrix2.rotate(cart_angle2, 0, 1, 0);
  pumpkinMdlMatrix2.rotate(cart_angle, 1, 0, 0);
  pumpkinMdlMatrix2.scale(0.2, 0.2, 0.2);
  let pumpkinMvpFromLight2;
  if(money >= 1){
    pumpkinMvpFromLight2 = drawOffScreen(pumpkinObj, pumpkinMdlMatrix2);
  }

  //pumpkin3
  let pumpkinMdlMatrix3 = new Matrix4();
  pumpkinMdlMatrix3.setRotate(rotateAngle, 0, 1, 0);
  pumpkinMdlMatrix3.translate(Cart_x, 1.7, Cart_z+1);
  pumpkinMdlMatrix3.rotate(cart_angle2, 0, 1, 0);
  pumpkinMdlMatrix3.rotate(cart_angle, 1, 0, 0);
  pumpkinMdlMatrix3.scale(0.2, 0.2, 0.2);
  let pumpkinMvpFromLight3;
  if(money == 2){
    pumpkinMvpFromLight3 = drawOffScreen(pumpkinObj, pumpkinMdlMatrix3);
  }



  var farmer_x = farmerMdlMatrix.elements[12];
  var farmer_y = farmerMdlMatrix.elements[13]-1.5;
  var farmer_z = farmerMdlMatrix.elements[14];
  
  var can_x = canMdlMatrix.elements[12];
  var can_y = canMdlMatrix.elements[13];
  var can_z = canMdlMatrix.elements[14];
  
  var dx = can_x - farmer_x;
  var dy = can_y - farmer_y;
  var dz = can_z - farmer_z;
  distance_can = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance can:",distance_can);
  
  var seed_x = bagMdlMatrix.elements[12];
  var seed_y = bagMdlMatrix.elements[13];
  var seed_z = bagMdlMatrix.elements[14];

  dx = seed_x - farmer_x;
  dy = seed_y - farmer_y;
  dz = seed_z - farmer_z;
  distance_seed = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance seed:",distance_seed);
  
  var fert_x = fertMdlMatrix.elements[12];
  var fert_y = fertMdlMatrix.elements[13];
  var fert_z = fertMdlMatrix.elements[14];

  dx = fert_x - farmer_x;
  dy = fert_y - farmer_y;
  dz = fert_z - farmer_z;
  distance_fert = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance fert:",distance_fert);
  
  var plant_x = pumpkinMdlMatrix.elements[12];
  var plant_y = pumpkinMdlMatrix.elements[13];
  var plant_z = pumpkinMdlMatrix.elements[14];

  dx = plant_x - farmer_x;
  dy = plant_y - farmer_y;
  dz = plant_z - farmer_z;
  distance_plant = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance plant:",distance_plant);
  
  var well_x = wellMdlMatrix.elements[12];
  var well_y = wellMdlMatrix.elements[13];
  var well_z = wellMdlMatrix.elements[14];

  dx = well_x - farmer_x;
  dy = well_y - farmer_y;
  dz = well_z - farmer_z;
  distance_well = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance well:",distance_well);
  
  var cart_x = cartMdlMatrix.elements[12];
  var cart_y = cartMdlMatrix.elements[13];
  var cart_z = cartMdlMatrix.elements[14];

  dx = cart_x - farmer_x;
  dy = cart_y - farmer_y;
  dz = cart_z - farmer_z;
  distance_cart = Math.sqrt(dx * dx + dy * dy + dz * dz);
  console.log("distance cart:",distance_cart);
  


  ///// on screen rendering
  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.4,0.4,0.4,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  //cube
  drawOneObjectOnScreen(cubeObj, cubeMdlMatrix,cubeMvpFromLight, "fieldTex");
  //cube2
  drawOneObjectOnScreen(cubeObj, cube2MdlMatrix,cube2MvpFromLight, "steelTex");
  //soil
  drawOneObjectOnScreen(cubeObj, soilMdlMatrix,soilMvpFromLight, "soilTex");
  //soil2
  drawOneObjectOnScreen(cubeObj, soil2MdlMatrix,soil2MvpFromLight, "soilTex");
  //soil3
  drawOneObjectOnScreen(cubeObj, soil3MdlMatrix,soil3MvpFromLight, "soilTex");
  //soil4
  drawOneObjectOnScreen(cubeObj, soil4MdlMatrix,soil4MvpFromLight, "soilTex");
  //road
  drawOneObjectOnScreen(cubeObj, roadMdlMatrix,roadMvpFromLight, "rockTex");
  //road2
  drawOneObjectOnScreen(cubeObj, road2MdlMatrix,road2MvpFromLight, "rockTex");
  //mario
  drawOneObjectOnScreen(farmerObj, marioMdlMatrix,marioMvpFromLight, "skin2Tex");
  //sonic
  drawOneObjectOnScreen(farmerObj, sonicMdlMatrix,sonicMvpFromLight, "skinTex");
  //garage
  drawOneObjectOnScreen(garageObj, garageMdlMatrix,garageMvpFromLight, "woodTex");
  //farmer
  drawOneObjectOnScreen(farmerObj, farmerMdlMatrix,farmerMvpFromLight, "woodTex");
  
  //can on hand
  if(can_on_hand == 1){
    drawOneObjectOnScreen(canObj, canonhandMdlMatrix,canonhandMvpFromLight, "canTex");
  }
  //seed on hand
  if(seed_on_hand == 1){
    drawOneObjectOnScreen(bagonhandObj, seedonhandMdlMatrix,seedonhandMvpFromLight, "bagTex");
  }
  //fert on hand
  if(fert_on_hand == 1){
    drawOneObjectOnScreen(bagonhandObj, fertonhandMdlMatrix,fertonhandMvpFromLight, "fertTex");
  }
  //plant on hand
  if(plant_on_hand == 1){
    drawOneObjectOnScreen(pumpkinObj, plantonhandMdlMatrix,plantonhandMvpFromLight, "pumpkinTex");
  }

  //tools
  drawOneObjectOnScreen(toolsObj, toolsMdlMatrix,toolsMvpFromLight, "steelTex");
  //bag
  drawOneObjectOnScreen(bagObj, bagMdlMatrix,bagMvpFromLight, "bagTex");
  //fert
  drawOneObjectOnScreen(bagObj, fertMdlMatrix,fertMvpFromLight, "fertTex");
  //can
  drawOneObjectOnScreen(canObj, canMdlMatrix,canMvpFromLight, "canTex");
  //well
  drawOneObjectOnScreen(wellObj, wellMdlMatrix,wellMvpFromLight, "rockTex");
  //cart
  drawOneObjectOnScreen(cartObj, cartMdlMatrix,cartMvpFromLight, "woodTex");
  //pumpkin2
  if(money >= 1){
    drawOneObjectOnScreen(pumpkinObj, pumpkinMdlMatrix2,pumpkinMvpFromLight2, "pumpkinTex");
  }
  //pumpkin3
  if(money == 2){
    drawOneObjectOnScreen(pumpkinObj, pumpkinMdlMatrix3,pumpkinMvpFromLight3, "pumpkinTex");
  }
  
  //plant
  if(plant_level == 0){

  }else if(plant_level == 1){
    drawOneObjectOnScreen(leafObj, leafMdlMatrix,leafMvpFromLight, "leafTex");
  }else if(plant_level == 2){
    drawOneObjectOnScreen(plantObj, plantMdlMatrix,plantMvpFromLight, "plantTex");
  }else if(plant_level == 3){
    drawOneObjectOnScreen(pumpkinObj, pumpkinMdlMatrix,pumpkinMvpFromLight, "pumpkinTex");
  }
  


  //Q12
  renderCubeMap(0, 0, 0);

  gl.viewport(0, 0, canvas.width, canvas.height);
  // gl.clearColor(0.4,0.4,0.4,1);
  // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // gl.enable(gl.DEPTH_TEST);

  rotateMatrix = new Matrix4();
  rotateMatrix.setRotate(angleY, 1, 0, 0);//for mouse rotation
  rotateMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  viewDir= new Vector3([cameraDirX, cameraDirY, cameraDirZ]);
  newViewDir = rotateMatrix.multiplyVector3(viewDir);
  
  vpMatrix = new Matrix4();
  vpMatrix.setPerspective(100, offScreenWidth/offScreenHeight, 0.6, 1000);
  vpMatrix.lookAt(cameraX, cameraY, cameraZ,   
                  cameraX + newViewDir.elements[0], 
                  cameraY + newViewDir.elements[1],
                  cameraZ + newViewDir.elements[2], 
                  0, 1, 0);

  // drawRegularObjects(vpMatrix);//ground, mario, sonic

  
  vpFromCamera = new Matrix4();
  vpFromCamera.setPerspective(100, offScreenWidth/offScreenHeight, 0.6, 1000);
  viewMatrixRotationOnly = new Matrix4();
  viewMatrixRotationOnly.lookAt(cameraX, cameraY, cameraZ, 
                                cameraX + newViewDir.elements[0], 
                                cameraY + newViewDir.elements[1], 
                                cameraZ + newViewDir.elements[2], 
                                0, 1, 0);
                                
  viewMatrixRotationOnly.elements[12] = 0; //ignore translation
  viewMatrixRotationOnly.elements[13] = 0;
  viewMatrixRotationOnly.elements[14] = 0;
  vpFromCamera.multiply(viewMatrixRotationOnly);
  vpFromCameraInverse = vpFromCamera.invert();

  drawEnvMap();

  //the sphere
  mdlMatrix = new Matrix4();
  mdlMatrix.setTranslate(0.0, 3, 0.0);
  mdlMatrix.scale(0.3, 0.3, 0.3);
  drawObjectWithDynamicReflection(sphereObj, mdlMatrix, vpMatrix, 0.95, 0.85, 0.4);

}

function drawOffScreen(obj, mdlMatrix){
  var mvpFromLight = new Matrix4();
  //model Matrix (part of the mvp matrix)
  let modelMatrix = new Matrix4();
  // modelMatrix.setRotate(angleY, 1, 0, 0);
  // modelMatrix.rotate(angleX, 0, 1, 0);
  modelMatrix.multiply(mdlMatrix);
  //mvp: projection * view * model matrix  
  mvpFromLight.setPerspective(100, offScreenWidth/offScreenHeight, 0.6, 1000);
  mvpFromLight.lookAt(lightX, lightY, lightZ, 0,0,0,0,1,0);
  mvpFromLight.multiply(modelMatrix);

  gl.uniformMatrix4fv(shadowProgram.u_MvpMatrix, false, mvpFromLight.elements);

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, shadowProgram.a_Position, obj[i].vertexBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }

  return mvpFromLight;
}

//obj: the object components
//mdlMatrix: the model matrix without mouse rotation
//colorR, G, B: object color
function drawOneObjectOnScreen(obj, mdlMatrix, mvpFromLight,texture_key){
  var mvpFromCamera = new Matrix4();
  //model Matrix (part of the mvp matrix)
  let modelMatrix = new Matrix4();
  // modelMatrix.setRotate(angleY, 1, 0, 0);//for mouse rotation
  // modelMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  modelMatrix.multiply(mdlMatrix);
  //mvp: projection * view * model matrix  
  mvpFromCamera.setPerspective(100, offScreenWidth/offScreenHeight, 0.6, 1000);
  let rotateMatrix = new Matrix4();
  rotateMatrix.setRotate(angleY, 1, 0, 0);//for mouse rotation
  rotateMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  var viewDir= new Vector3([cameraDirX, cameraDirY, cameraDirZ]);
  var newViewDir = rotateMatrix.multiplyVector3(viewDir);
  mvpFromCamera.lookAt(cameraX, cameraY, cameraZ, 
                        cameraX + newViewDir.elements[0], 
                        cameraY + newViewDir.elements[1], 
                        cameraZ + newViewDir.elements[2], 
                        0, 1, 0);
  mvpFromCamera.multiply(modelMatrix);

  //normal matrix
  let normalMatrix = new Matrix4();
  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniform3f(program.u_LightPosition, lightX, lightY, lightZ);
  gl.uniform3f(program.u_ViewPosition, cameraX, cameraY, cameraZ);
  gl.uniform1f(program.u_Ka, 0.2);
  gl.uniform1f(program.u_Kd, 0.7);
  gl.uniform1f(program.u_Ks, 1.0);
  gl.uniform1f(program.u_shininess, 10.0);
  gl.uniform1i(program.u_ShadowMap, 0);
  // gl.uniform3f(program.u_Color, colorR, colorG, colorB);

  gl.uniformMatrix4fv(program.u_MvpMatrix, false, mvpFromCamera.elements);
  gl.uniformMatrix4fv(program.u_modelMatrix, false, modelMatrix.elements);
  gl.uniformMatrix4fv(program.u_normalMatrix, false, normalMatrix.elements);
  gl.uniformMatrix4fv(program.u_MvpMatrixOfLight, false, mvpFromLight.elements);

  gl.activeTexture(gl.TEXTURE0);   
  gl.bindTexture(gl.TEXTURE_2D, fbo.texture); 

  gl.activeTexture(gl.TEXTURE1); 
  gl.bindTexture(gl.TEXTURE_2D,textures[texture_key]);
  gl.uniform1i(program.u_Sampler0,1);   

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, program.a_Position, obj[i].vertexBuffer);
    initAttributeVariable(gl, program.a_TexCoord, obj[i].texCoordBuffer);
    initAttributeVariable(gl, program.a_Normal, obj[i].normalBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }
}


function drawEnvMap(){
  //quad
  gl.useProgram(programEnvCube);
  gl.depthFunc(gl.LEQUAL);
  gl.uniformMatrix4fv(programEnvCube.u_viewDirectionProjectionInverse, 
                      false, vpFromCameraInverse.elements);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMapTex);
  gl.uniform1i(programEnvCube.u_envCubeMap, 0);
  initAttributeVariable(gl, programEnvCube.a_Position, quadObj.vertexBuffer);
  gl.drawArrays(gl.TRIANGLES, 0, quadObj.numVertices);
}

function drawRegularObjects(vpMatrix){
  let mdlMatrix = new Matrix4();

  //cube
  mdlMatrix.setTranslate(0.0, -3.0, 0.0);
  mdlMatrix.scale(20, 0.2, 20);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"fieldTex");

  //soil
  mdlMatrix.setTranslate(-5.0, 0.2-3, -5.0);
  mdlMatrix.scale(3, 0.1, 3);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"soilTex");
  //soil2
  mdlMatrix.setTranslate(-13.0, 0.2-3, -5.0);
  mdlMatrix.scale(3, 0.1, 3);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"soilTex");
  //soil3
  mdlMatrix.setTranslate(-5.0, 0.2-3, -13.0);
  mdlMatrix.scale(3, 0.1, 3);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"soilTex");
  //soil4
  mdlMatrix.setTranslate(-13.0, 0.2-3, -13.0);
  mdlMatrix.scale(3, 0.1, 3);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"soilTex");

  //road
  mdlMatrix.setTranslate(0.0, 0.11-3, 16.0);
  mdlMatrix.scale(20, 0.1, 4);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"rockTex");
  //road
  mdlMatrix.setTranslate(0.0, 0.11-3, 8.0);
  mdlMatrix.scale(2.5, 0.1, 4);
  drawOneRegularObject(cubeObj, mdlMatrix, vpMatrix,"rockTex");

  //mario
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(4, 2.4-3, -7.5);
  mdlMatrix.scale(1.8, 1.5, 1.8);
  drawOneRegularObject(farmerObj, mdlMatrix, vpMatrix,"woodTex");

  //sonic
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(0.0, 1.7-3, -7.5);
  mdlMatrix.scale(2.0, 1.0,2.0);
  drawOneRegularObject(farmerObj, mdlMatrix, vpMatrix,"trackTex");

  //garage
  mdlMatrix.setTranslate(12.0, -3, -7.0);
  mdlMatrix.rotate(rotateAngle-90, 0, 1, 0);
  mdlMatrix.scale(1.2, 0.9,1.2);
  drawOneRegularObject(garageObj, mdlMatrix, vpMatrix,"woodTex");

  //farmer
  if(lookmode == 1){
    mdlMatrix.setTranslate(cameraX, cameraY-3, cameraZ);
  }else{
    mdlMatrix.setTranslate(cameraX, cameraY-6, cameraZ);
  }
  mdlMatrix.rotate(180, 0, 1, 0);
  mdlMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  mdlMatrix.scale(1.8, 1.2, 1.8);
  drawOneRegularObject(farmerObj, mdlMatrix, vpMatrix,"woodTex");

  //can on hand
  if(can_on_hand==1){
    mdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    mdlMatrix.translate(0.4, -0.5-3, -1.0);
    mdlMatrix.rotate(-90, 0, 1, 0);
    mdlMatrix.scale(0.0015, 0.001,0.0015);
    drawOneRegularObject(canObj, mdlMatrix, vpMatrix,"canTex");
  }
  //seed on hand
  if(seed_on_hand==1){
    mdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    mdlMatrix.translate(0.2, -0.5-3, -0.8);
    mdlMatrix.rotate(-90, 0, 1, 0);
    mdlMatrix.rotate(-90, 1, 0, 0);
    mdlMatrix.scale(0.02, 0.02,0.02);
    drawOneRegularObject(bagonhandObj, mdlMatrix, vpMatrix,"bagTex");
  }
  //fert on hand
  if(fert_on_hand==1){
    mdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    mdlMatrix.translate(0.2, -0.5-3, -0.8);
    mdlMatrix.rotate(-90, 0, 1, 0);
    mdlMatrix.rotate(-90, 1, 0, 0);
    mdlMatrix.scale(0.02, 0.02,0.02);
    drawOneRegularObject(bagonhandObj, mdlMatrix, vpMatrix,"fertTex");
  }
  //plant on hand
  if(plant_on_hand==1){
    mdlMatrix.setTranslate(cameraX, cameraY, cameraZ);
    mdlMatrix.translate(0.45, -0.8-3, -1.0);
    mdlMatrix.rotate(0, 0, 1, 0);
    mdlMatrix.scale(0.15, 0.15, 0.15);
    drawOneRegularObject(pumpkinObj, mdlMatrix, vpMatrix,"pumpkinTex");
  }

  //tools
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(13, 0.0-3, -7);
  mdlMatrix.scale(0.2, 0.2,0.2);
  drawOneRegularObject(toolsObj, mdlMatrix, vpMatrix,"steelTex");
  
  //bag
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(4.0, 0.3-3, -6);
  mdlMatrix.scale(1, 1,1);
  drawOneRegularObject(bagObj, mdlMatrix, vpMatrix,"bagTex");

  //fertilizer
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(0.0, 0.3-3, -6);
  mdlMatrix.scale(1, 1,1);
  drawOneRegularObject(bagObj, mdlMatrix, vpMatrix,"fertTex");

  //can
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(15, 0.5-3, -5);
  mdlMatrix.scale(0.0015, 0.001,0.0015);
  drawOneRegularObject(canObj, mdlMatrix, vpMatrix,"canTex");

  //well
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(-6, 0.3-3, 6);
  mdlMatrix.scale(1, 1,1);
  drawOneRegularObject(wellObj, mdlMatrix, vpMatrix,"rockTex");

  //cart
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(8, 1.1-3, 10);
  mdlMatrix.rotate(0, 0, 1, 0);
  mdlMatrix.rotate(-15, 1, 0, 0);
  mdlMatrix.scale(0.03, 0.03,0.03);
  drawOneRegularObject(cartObj, mdlMatrix, vpMatrix,"woodTex");

  //pumpkin
  mdlMatrix.setRotate(rotateAngle, 0, 1, 0);
  mdlMatrix.translate(-5.0, 0.3-3, -5);
  mdlMatrix.scale(0.2, 0.2, 0.2);
  drawOneRegularObject(pumpkinObj, mdlMatrix, vpMatrix,"pumpkinTex");
}

function drawOneRegularObject(obj, modelMatrix, vpMatrix,texture_key){
  gl.useProgram(program);
  let mvpMatrix = new Matrix4();
  let normalMatrix = new Matrix4();
  mvpMatrix.set(vpMatrix);
  mvpMatrix.multiply(modelMatrix);

  //normal matrix
  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniform3f(program.u_LightPosition, lightX, lightY, lightZ);
  gl.uniform3f(program.u_ViewPosition, cameraX, cameraY, cameraZ);
  gl.uniform1f(program.u_Ka, 0.2);
  gl.uniform1f(program.u_Kd, 0.7);
  gl.uniform1f(program.u_Ks, 1.0);
  gl.uniform1f(program.u_shininess, 10.0);
  gl.uniform1i(program.u_ShadowMap, 0);
  // gl.uniform3f(program.u_Color, colorR, colorG, colorB);

  gl.uniformMatrix4fv(program.u_MvpMatrix, false, mvpMatrix.elements);
  gl.uniformMatrix4fv(program.u_modelMatrix, false, modelMatrix.elements);
  gl.uniformMatrix4fv(program.u_normalMatrix, false, normalMatrix.elements);
  // gl.uniformMatrix4fv(program.u_MvpMatrixOfLight, false, mvpFromLight.elements);

  gl.activeTexture(gl.TEXTURE1); 
  gl.bindTexture(gl.TEXTURE_2D,textures[texture_key]);
  gl.uniform1i(program.u_Sampler0,1);  

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, program.a_Position, obj[i].vertexBuffer);
    initAttributeVariable(gl, program.a_Normal, obj[i].normalBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }
}

function drawObjectWithDynamicReflection(obj, modelMatrix, vpMatrix, colorR, colorG, colorB){
  gl.useProgram(programTextureOnCube);
  let mvpMatrix = new Matrix4();
  let normalMatrix = new Matrix4();
  mvpMatrix.set(vpMatrix);
  mvpMatrix.multiply(modelMatrix);

  //normal matrix
  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();

  gl.uniform3f(programTextureOnCube.u_ViewPosition, cameraX, cameraY, cameraZ);
  gl.uniform3f(programTextureOnCube.u_Color, colorR, colorG, colorB);

  gl.uniformMatrix4fv(programTextureOnCube.u_MvpMatrix, false, mvpMatrix.elements);
  gl.uniformMatrix4fv(programTextureOnCube.u_modelMatrix, false, modelMatrix.elements);
  gl.uniformMatrix4fv(programTextureOnCube.u_normalMatrix, false, normalMatrix.elements);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, fbo2.texture);
  gl.uniform1i(programTextureOnCube.u_envCubeMap, 0);

  // gl.activeTexture(gl.TEXTURE1); 
  // gl.bindTexture(gl.TEXTURE_2D,textures[texture_key]);
  // gl.uniform1i(program.u_Sampler0,1);  

  for( let i=0; i < obj.length; i ++ ){
    initAttributeVariable(gl, programTextureOnCube.a_Position, obj[i].vertexBuffer);
    initAttributeVariable(gl, programTextureOnCube.a_Normal, obj[i].normalBuffer);
    gl.drawArrays(gl.TRIANGLES, 0, obj[i].numVertices);
  }
}


async function loadOBJtoCreateVBO( objFile ){
  let objComponents = [];
  response = await fetch(objFile);
  text = await response.text();
  obj = parseOBJ(text);
  for( let i=0; i < obj.geometries.length; i ++ ){
    let o = initVertexBufferForLaterUse(gl, 
                                        obj.geometries[i].data.position,
                                        obj.geometries[i].data.normal, 
                                        obj.geometries[i].data.texcoord);
    objComponents.push(o);
  }
  return objComponents;
}


function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}


function mouseDown(ev){ 
    var x = ev.clientX;
    var y = ev.clientY;
    var rect = ev.target.getBoundingClientRect();
    if( rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom){
        mouseLastX = x;
        mouseLastY = y;
        mouseDragging = true;
    }
}

function mouseUp(ev){ 
    mouseDragging = false;
}

function mouseMove(ev){ 
    var x = ev.clientX;
    var y = ev.clientY;
    if( mouseDragging ){
        var factor = 100/canvas.height; //100 determine the spped you rotate the object
        var dx = factor * (x - mouseLastX);
        var dy = factor * (y - mouseLastY);

        angleX += dx; //yes, x for y, y for x, this is right
        angleY += dy;
    }
    mouseLastX = x;
    mouseLastY = y;

    draw();
}

function keydown(ev){ 
  //implment keydown event here
  let rotateMatrix = new Matrix4();
  rotateMatrix.setRotate(angleY, 1, 0, 0);//for mouse rotation
  rotateMatrix.rotate(angleX, 0, 1, 0);//for mouse rotation
  var viewDir= new Vector3([cameraDirX, cameraDirY, cameraDirZ]);
  var newViewDir = rotateMatrix.multiplyVector3(viewDir);

  if(ev.key == 'w'){ 
      cameraX += (newViewDir.elements[0] * 0.1);
      // cameraY += (newViewDir.elements[1] * 0.1);
      cameraZ += (newViewDir.elements[2] * 0.1);
  }
  else if(ev.key == 's'){ 
    cameraX -= (newViewDir.elements[0] * 0.1);
    // cameraY -= (newViewDir.elements[1] * 0.1);
    cameraZ -= (newViewDir.elements[2] * 0.1);
  }
  else if(ev.key == 'a'){ 
    cameraX += (newViewDir.elements[2] * 0.1);
    // cameraY -= (newViewDir.elements[1] * 0.1);
    cameraZ -= (newViewDir.elements[0] * 0.1);
  }
  else if(ev.key == 'd'){ 
    cameraX -= (newViewDir.elements[2] * 0.1);
    // cameraY -= (newViewDir.elements[1] * 0.1);
    cameraZ += (newViewDir.elements[0] * 0.1);
  }
  else if(ev.key == 'z' && lookmode == 1){ 
    lookmode = 3;
    cameraX += (newViewDir.elements[0] * 1);
    cameraY += 3;
    cameraZ += (newViewDir.elements[2] * 1);
    cameraDirX = 0;
    cameraDirY = -3;
    cameraDirZ = -4;
  }
  else if(ev.key == 'x' && lookmode == 3){
    lookmode = 1;
    cameraX -= (newViewDir.elements[0] * 1);
    cameraY -= 3;
    cameraZ -= (newViewDir.elements[2] * 1);
    cameraDirX = 0;
    cameraDirY = 0;
    cameraDirZ = -1;
  }
  else if(ev.key == 'g'){
    if(distance_can < 1.5){
      can_on_hand = 0;
      seed_on_hand = 0;
      fert_on_hand = 0;
      plant_on_hand = 0;

      can_on_hand = 1;
    }else if(distance_seed < 1.5){
      can_on_hand = 0;
      seed_on_hand = 0;
      fert_on_hand = 0;
      plant_on_hand = 0;

      seed_on_hand = 1;
    }else if(distance_fert < 1.5){
      can_on_hand = 0;
      seed_on_hand = 0;
      fert_on_hand = 0;
      plant_on_hand = 0;

      fert_on_hand = 1;
    }else if(distance_plant < 1.5 && plant_level == 3){
      can_on_hand = 0;
      seed_on_hand = 0;
      fert_on_hand = 0;
      plant_on_hand = 0;

      plant_on_hand = 1;
      plant_level = 0;
    }
  }
  else if(ev.key == 'h'){
    if(distance_can < 1.5){
      can_on_hand = 0;
    }else if(distance_seed < 1.5){
      seed_on_hand = 0;
    }else if(distance_fert < 1.5){
      fert_on_hand = 0;
    }else if(distance_cart < 3 && plant_on_hand == 1){
      plant_on_hand = 0;
      money ++;
    }
  }
  else if(ev.key == 'e'){
    if(distance_plant < 1.5 && seed_on_hand == 1 && plant_level == 0){
      seed_on_hand = 0;
      plant_level = 1;
    }
    if(distance_well < 1.5 && can_on_hand == 1){
      water_filled = 1;
    }
    if(distance_plant < 1.5 && can_on_hand == 1 && water_filled == 1 && plant_level == 1){
      water_filled = 0;
      plant_level = 2;
    }
    if(distance_plant < 1.5 && fert_on_hand == 1 && plant_level == 2){
      fert_on_hand = 0;
      plant_level = 3;
    }
  }
  else if(ev.key == 'l'){
    plant_level ++;
    if(plant_level == 4){
      plant_level = 0;
    }
  }
  else if(ev.key == 'q' && money == 2){
    end = 1;
  }
  draw();
}

function initFrameBufferForCubemapRendering(gl){
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

  // 6 2D textures
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  for (let i = 0; i < 6; i++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 
                  gl.RGBA, offScreenWidth, offScreenHeight, 0, gl.RGBA, 
                  gl.UNSIGNED_BYTE, null);
  }

  //create and setup a render buffer as the depth buffer
  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                          offScreenWidth, offScreenHeight);

  //create and setup framebuffer: linke the depth buffer to it (no color buffer here)
  var frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                              gl.RENDERBUFFER, depthBuffer);

  frameBuffer.texture = texture;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return frameBuffer;
}

function renderCubeMap(camX, camY, camZ)
{
  //camera 6 direction to render 6 cubemap faces
  var ENV_CUBE_LOOK_DIR = [
      [1.0, 0.0, 0.0],
      [-1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
      [0.0, -1.0, 0.0],
      [0.0, 0.0, 1.0],
      [0.0, 0.0, -1.0]
  ];

  //camera 6 look up vector to render 6 cubemap faces
  var ENV_CUBE_LOOK_UP = [
      [0.0, -1.0, 0.0],
      [0.0, -1.0, 0.0],
      [0.0, 0.0, 1.0],
      [0.0, 0.0, -1.0],
      [0.0, -1.0, 0.0],
      [0.0, -1.0, 0.0]
  ];

  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2);
  gl.viewport(0, 0, offScreenWidth, offScreenHeight);
  gl.clearColor(0.4, 0.4, 0.4,1);
  for (var side = 0; side < 6;side++){
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                            gl.TEXTURE_CUBE_MAP_POSITIVE_X+side, fbo2.texture, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let vpMatrix = new Matrix4();
    vpMatrix.setPerspective(90, 1, 1, 100);
    vpMatrix.lookAt(camX, camY, camZ,   
                    camX + ENV_CUBE_LOOK_DIR[side][0], 
                    camY + ENV_CUBE_LOOK_DIR[side][1],
                    camZ + ENV_CUBE_LOOK_DIR[side][2], 
                    ENV_CUBE_LOOK_UP[side][0],
                    ENV_CUBE_LOOK_UP[side][1],
                    ENV_CUBE_LOOK_UP[side][2]);
  
    drawRegularObjects(vpMatrix);
    vpFromCameraInverse = vpMatrix.invert();
    drawEnvMap();
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initCubeTexture(posXName, negXName, posYName, negYName, 
  posZName, negZName, imgWidth, imgHeight)
{
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const faceInfos = [
    {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    fName: posXName,
    },
    {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    fName: negXName,
    },
    {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    fName: posYName,
    },
    {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    fName: negYName,
    },
    {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    fName: posZName,
    },
    {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
    fName: negZName,
    },
    ];
    faceInfos.forEach((faceInfo) => {
    const {target, fName} = faceInfo;
    // setup each face so it's immediately renderable
    gl.texImage2D(target, 0, gl.RGBA, imgWidth, imgHeight, 0, 
    gl.RGBA, gl.UNSIGNED_BYTE, null);

    var image = new Image();
    image.onload = function(){
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    };
    image.src = fName;
    });
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    return texture;
}

function initFrameBuffer(gl){
  //create and set up a texture object as the color buffer
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, offScreenWidth, offScreenHeight,
                  0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  

  //create and setup a render buffer as the depth buffer
  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                          offScreenWidth, offScreenHeight);

  //create and setup framebuffer: linke the color and depth buffer to it
  var frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                            gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                              gl.RENDERBUFFER, depthBuffer);
  frameBuffer.texture = texture;
  return frameBuffer;
}

function initTexture(gl, img, texKey){
  gl.useProgram(program);
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  // Set the parameters so we can render any size image.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  // Upload the image into the texture.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

  textures[texKey] = tex;

  texCount++;
  if( texCount == numTextures)draw();
}