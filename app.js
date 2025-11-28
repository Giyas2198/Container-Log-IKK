// app.js: Kontrol Utama (Firebase & Three.js) - Versi Planner Dinamis

// --- 1. KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyC0t5s8...", // <-- GANTI DENGAN KUNCI API ASLI ANDA
    authDomain: "giyas-coding.firebaseapp.com",
    projectId: "giyas-coding", 
    storageBucket: "giyas-coding.appspot.com",
    messagingSenderId: "3814315892324",
    appId: "1:3814315892324:web:f51759b37e76705d83971"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. DIMENSI MODA TRANSPORTASI (DALAM METER) ---
const MODA_DIMENSIONS = {
    '40hc': { name: 'Container 40ft HC', length: 12.0, width: 2.4, height: 2.4 }, // Disesuaikan dengan permintaan
    '20ft': { name: 'Container 20ft', length: 6.2, width: 2.4, height: 2.4 },     // Disesuaikan dengan permintaan
    'tronton_lossbak': { name: 'Tronton Lossbak', length: 9.4, width: 2.4, height: 2.6 }, // Tinggi 2.6m (untuk batas visual)
    'wingbox': { name: 'Wingbox', length: 12.0, width: 2.4, height: 2.4 },       // Disesuaikan dengan permintaan
};

// Kontainer/Moda Default (Gunakan 40hc sebagai default)
let CONTAINER_DIMENSIONS = MODA_DIMENSIONS['40hc'];


// --- 3. SETUP THREE.JS GLOBAL & UTILITY ---
let scene, camera, renderer, controls;
const visualizationContainer = document.getElementById('visualization-container');
const materialListDiv = document.getElementById('material-list');
const itemsInScene = [];

// Variabel Kontrol Drag and Drop BARU
let isMoveModeActive = false;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let draggableObject = null;
let controlsEnabledBeforeDrag = true;
let plane; // Plane untuk menentukan posisi drag di lantai
let rollsToAnimate = []; // Array untuk roll yang sedang bergerak

// --- BARU: Variabel Crane dan Kontainer ---
let containerMesh; // Mesh kontainer (kerangka)
let craneGroup;    // Group untuk model crane
let craneActive = false; // Status visualisasi crane
// ------------------------------------------

// --- BARU: Penyimpanan Warna Material ---
const materialColors = {};

/** FUNGSI BARU: Mendapatkan atau Menghasilkan Warna untuk Material ID */
function getMaterialColor(materialId) {
    if (!materialColors[materialId]) {
        // Hasilkan warna acak baru jika belum ada
        materialColors[materialId] = new THREE.Color(Math.random() * 0xffffff);
    }
    return materialColors[materialId];
}
// ------------------------------------------

/** Menampilkan pesan status */
function showStatus(msg, isError = false) {
    const statusDiv = document.getElementById('status-message');
    statusDiv.textContent = msg;
    // Menggunakan class CSS untuk styling
    statusDiv.style.backgroundColor = isError ? '#f8d7da' : '#d4edda'; // Bootstrap-like colors
    statusDiv.style.color = isError ? '#721c24' : '#155724';
    statusDiv.style.border = isError ? '1px solid #f5c6cb' : '1px solid #c3e6cb';
}

/** Menampilkan pesan pop-up Alert BARU */
function showAlertPopup(msg) {
    // Kosongkan pesan status di UI
    document.getElementById('status-message').textContent = '';
    // Tampilkan notifikasi pop-up
    alert(msg); 
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    camera = new THREE.PerspectiveCamera(75, visualizationContainer.clientWidth / visualizationContainer.clientHeight, 0.1, 1000);
    camera.position.set(15, 8, 15); 
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(visualizationContainer.clientWidth, visualizationContainer.clientHeight);
    visualizationContainer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0x404040, 2); 
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5); 
    scene.add(directionalLight);
    
    const gridHelper = new THREE.GridHelper(20, 20, 0x0000ff, 0x808080);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Tambahkan plane untuk raycasting (lantai kontainer)
    plane = new THREE.Mesh(
        new THREE.PlaneGeometry(CONTAINER_DIMENSIONS.length, CONTAINER_DIMENSIONS.width),
        new THREE.MeshBasicMaterial({ visible: false }) // Plane tidak terlihat
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    scene.add(plane);
    
    // Inisialisasi Event Listeners Drag
    setupDragEventListeners();

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        
        // --- LOGIKA ANIMASI BARU ---
        if (rollsToAnimate.length > 0) {
            animateRollPlacement();
        }
        // -------------------------

        renderer.render(scene, camera);
    }
    animate();
}

/** FUNGSI BARU: Menggerakkan roll dari atas ke posisi akhirnya (efek jatuh) */
function animateRollPlacement() {
    // Kecepatan 'jatuh' (contoh: 0.1 meter per frame)
    const speed = 0.15; 
    
    // Filter roll yang masih perlu dianimasikan
    rollsToAnimate = rollsToAnimate.filter(mesh => {
        const targetY = mesh.userData.targetY;
        
        // Pindahkan ke bawah
        mesh.position.y -= speed;
        
        // Cek apakah sudah mencapai target Y
        if (mesh.position.y <= targetY) {
            mesh.position.y = targetY; // Pastikan berhenti di posisi yang tepat
            // Hapus dari daftar untuk dianimasikan
            return false; 
        }
        // Tetap di daftar untuk dianimasikan
        return true;
    });
}

// FUNGSI BARU: Mengatur event listener drag and drop 3D
function setupDragEventListeners() {
    visualizationContainer.addEventListener('mousedown', onMouseDown, false);
    visualizationContainer.addEventListener('mousemove', onMouseMove, false);
    visualizationContainer.addEventListener('mouseup', onMouseUp, false);
}

function onMouseDown(event) {
    if (!isMoveModeActive) return;

    // Hitung posisi mouse dalam koordinat terstandarisasi (-1 hingga +1)
    const rect = visualizationContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Cari objek yang bisa didrag (semua item yang bukan kerangka/plane)
    const items = itemsInScene.filter(item => item !== containerMesh && item !== plane); // Ganti itemsInScene.containerFrame ke containerMesh
    const intersects = raycaster.intersectObjects(items);

    if (intersects.length > 0) {
        // Objek pertama yang berpotongan adalah yang akan kita drag
        draggableObject = intersects[0].object;
        
        // Nonaktifkan OrbitControls agar kamera tidak bergerak saat drag
        controlsEnabledBeforeDrag = controls.enabled;
        controls.enabled = false; 
    }
}

function onMouseMove(event) {
    if (!isMoveModeActive || !draggableObject) return;
    
    // Hitung posisi mouse baru
    const rect = visualizationContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Tentukan perpotongan dengan 'plane' (lantai) untuk mendapatkan posisi 3D di mana roll harus dipindahkan
    const intersects = raycaster.intersectObject(plane);

    if (intersects.length > 0) {
        // Ambil posisi 3D pada plane
        const intersectPoint = intersects[0].point;
        
        // Hitung batas-batas kontainer
        const halfContL = CONTAINER_DIMENSIONS.length / 2;
        const halfContW = CONTAINER_DIMENSIONS.width / 2;
        
        // Radius Roll (diameter/2)
        const radius = draggableObject.userData.D / 2; 

        // Terapkan batas kontainer
        let newX = intersectPoint.x;
        let newZ = intersectPoint.z;
        
        // X Boundaries: (Roll berdiri, Diameter D berada di X/Z)
        newX = Math.max(newX, -(halfContL) + radius);
        newX = Math.min(newX, halfContL - radius);

        // Z Boundaries: (Roll berdiri, Diameter D berada di X/Z)
        newZ = Math.max(newZ, -(halfContW) + radius);
        newZ = Math.min(newZ, halfContW - radius);
        
        // Pindahkan objek ke posisi baru (pastikan Y tetap pada lantai)
        draggableObject.position.x = newX;
        draggableObject.position.z = newZ;
    }
}

function onMouseUp() {
    if (!isMoveModeActive) return;
    
    if (draggableObject) {
        draggableObject = null;
        // Kembalikan status kontrol kamera
        controls.enabled = controlsEnabledBeforeDrag; 
    }
}

/** FUNGSI BARU: Mengganti Moda Kontainer dan Memperbarui Visualisasi Kerangka */
function changeContainerModa(modaKey) {
    CONTAINER_DIMENSIONS = MODA_DIMENSIONS[modaKey];
    
    // 1. Perbarui tampilan info
    document.getElementById('current-moda-display').textContent = CONTAINER_DIMENSIONS.name;
    document.getElementById('container-info').innerHTML = `
        Tipe Moda: <span id="current-moda-display">${CONTAINER_DIMENSIONS.name}</span> 
        (P: ${CONTAINER_DIMENSIONS.length.toFixed(2)}m | 
        L: ${CONTAINER_DIMENSIONS.width.toFixed(2)}m | 
        T: ${CONTAINER_DIMENSIONS.height.toFixed(2)}m)
    `;

    // 2. Perbarui kerangka kontainer
    visualizeContainerFrame();

    // 3. Peringatan: Hapus semua roll agar tidak ada roll yang keluar batas moda baru
    itemsInScene.filter(mesh => mesh !== containerMesh && mesh !== plane).forEach(mesh => scene.remove(mesh));
    itemsInScene.splice(itemsInScene.indexOf(containerMesh) + 1, itemsInScene.length); // Hapus semua setelah containerMesh
    rollsToAnimate = []; // Reset animasi
    // CATATAN: materialColors tidak direset karena ID Material tetap sama

    showStatus(`Moda diubah menjadi ${CONTAINER_DIMENSIONS.name}. Harap klik "Visualisasi Pemuatan 3D" kembali.`, false);
}


function visualizeContainerFrame() {
    if (containerMesh) { // Use global containerMesh
        scene.remove(containerMesh);
    }
    
    // [BARU] Hapus juga crane lama saat ganti moda/reset
    if (craneGroup) {
        scene.remove(craneGroup);
        craneGroup = null; // Reset
        craneActive = false;
    }

    const { length: L, width: W, height: H } = CONTAINER_DIMENSIONS;
    
    const geometry = new THREE.BoxGeometry(L, H, W);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x4a4a4a, 
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });
    
    containerMesh = new THREE.Mesh(geometry, material); // Assign to global
    containerMesh.position.set(0, H / 2, 0); 
    containerMesh.name = 'ContainerFrame'; // Add name for clarity
    
    itemsInScene.containerFrame = containerMesh; // Keep for backward compatibility with itemsInScene logic
    scene.add(containerMesh);
    
    // Update plane raycasting agar sesuai dengan ukuran moda baru
    if (plane) {
        scene.remove(plane);
    }
    plane = new THREE.Mesh(
        new THREE.PlaneGeometry(L, W),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    scene.add(plane);
}


/**
 * [UPDATE] Membuat model crane sederhana (L-Shape dan Spreader Bar).
 * @returns {THREE.Group} Group yang berisi komponen crane.
 */
function createCrane() {
    const referencePoint = new THREE.Group();
    referencePoint.name = 'CraneReferencePoint';
    
    const craneModelGroup = new THREE.Group();
    craneModelGroup.name = 'CraneGroup';
    const CRANE_COLOR = 0xAAAA00; // Kuning

    // Dimensi berdasarkan moda yang sedang aktif
    const dimensions = CONTAINER_DIMENSIONS;
    const containerLength = dimensions.length;
    const containerWidth = dimensions.width;
    const containerHeight = dimensions.height;

    // Tinggi Crane
    const pillarHeight = containerHeight * 2.5; 
    
    // 1. Tiang Utama (Pillar - Bagian Vertikal dari Siku L)
    const pillarGeo = new THREE.BoxGeometry(0.5, pillarHeight, 0.5);
    const pillarMat = new THREE.MeshPhongMaterial({ color: CRANE_COLOR });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    
    // Posisikan tiang di luar kontainer
    pillar.position.set(containerLength / 2 + 1, pillarHeight / 2, containerWidth / 2 + 1);
    craneModelGroup.add(pillar);

    // 2. Lengan Crane (Boom - Bagian Horizontal dari Siku L)
    const boomLength = containerLength + 2; // Memanjang melewati tengah
    const boomGeo = new THREE.BoxGeometry(0.5, 0.5, boomLength);
    const boomMat = new THREE.MeshPhongMaterial({ color: 0x888800 });
    const boom = new THREE.Mesh(boomGeo, boomMat);
    
    // Posisikan boom di atas tiang, memanjang sejajar sumbu Z ke tengah wadah
    boom.position.set(pillar.position.x, pillarHeight, 0); // Di tengah Z, di sisi X
    craneModelGroup.add(boom);

    // 3. Tali Utama (Dari ujung boom ke tengah kontainer)
    const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, pillarHeight - containerHeight, 8);
    const ropeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    
    // Posisikan tali di atas pusat X=0, Y di tengah antara lantai dan boom
    rope.rotation.x = Math.PI / 2; // Vertikal
    rope.position.set(0, pillarHeight - (pillarHeight - containerHeight) / 2, 0); 
    // CATATAN: Posisi rope ini hanya visual, tidak perlu akurat ke spreader bar
    craneModelGroup.add(rope);

    // 4. Spreader Bar (Palang Penghubung di atas Container)
    const spreaderLength = containerWidth + 0.2; // Sedikit lebih lebar dari container
    const spreaderGeo = new THREE.BoxGeometry(0.2, 0.2, spreaderLength);
    const spreaderMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const spreader = new THREE.Mesh(spreaderGeo, spreaderMat);
    spreader.name = 'SpreaderBar'; 
    
    // Posisikan Spreader Bar di atas pusat kontainer
    const initialSpreaderY = containerHeight + 0.5; // Sedikit di atas kerangka kontainer
    spreader.position.set(0, initialSpreaderY, 0); 
    craneModelGroup.add(spreader);
    
    craneModelGroup.visible = false; // Sembunyikan crane secara default
    
    // Posisikan Reference Point (agar mudah dipindahkan sebagai satu kesatuan)
    referencePoint.position.x = -containerLength / 2 - 2;
    referencePoint.position.z = 0; 
    
    referencePoint.add(craneModelGroup);

    return referencePoint;
}

/**
 * [BARU] Menampilkan/Menyembunyikan model crane.
 */
function toggleCraneVisual() {
    if (!containerMesh) {
        showStatus('❌ Visualisasi Kontainer Belum Siap!', true);
        return;
    }

    if (!craneGroup) {
        // Hapus group crane lama jika ada (saat ganti moda)
        if (scene.getObjectByName('CraneReferencePoint')) {
            scene.remove(scene.getObjectByName('CraneReferencePoint'));
        }
        craneGroup = createCrane(); // Ini mengembalikan Group Reference Point
        scene.add(craneGroup);
    }
    
    // Toggle tampilan
    const craneModel = craneGroup.getObjectByName('CraneGroup');
    if (craneModel) {
        craneModel.visible = !craneModel.visible;
        craneActive = craneModel.visible;
    } else {
        craneActive = false;
    }


    showStatus(`🏗️ Visualisasi Crane: **${craneActive ? 'AKTIF' : 'NON-AKTIF'}**. Klik lagi untuk simulasi pengangkatan Kontainer.`, false);
}

/**
 * [UPDATE] Fungsi animasi pengangkatan/penurunan wadah.
 * Logika ini mengangkat containerMesh DAN semua Roll (itemsInScene) secara bersamaan.
 */
function animateCraneLift() {
    // Kumpulkan semua objek yang akan diangkat (ContainerFrame + Roll-Roll)
    const itemsToLift = itemsInScene.filter(mesh => mesh !== plane); 
    
    if (itemsToLift.length === 0 || !craneActive) {
        showStatus('❌ Tidak ada objek yang bisa diangkat atau Crane belum aktif!', true);
        return;
    }

    const firstItem = itemsToLift.find(mesh => mesh.name === 'ContainerFrame') || itemsToLift[0];
    
    // Posisi Y saat ini dari lantai (base Y=0)
    // Hitung ketinggian dasar dari item yang dipilih (container atau roll)
    const currentBaseY = firstItem.position.y - (firstItem.userData.L ? firstItem.userData.L / 2 : CONTAINER_DIMENSIONS.height / 2);
    
    const initialY = 0; // Lantai selalu Y=0 
    const liftHeight = CONTAINER_DIMENSIONS.height + 3; // Angkat cukup tinggi (misal: 3m di atas container)
    
    // Periksa status saat ini: Jika sudah terangkat (currentBaseY > 0.5), turunkan. Jika di bawah/di posisi, angkat.
    const isRaised = currentBaseY > initialY + 0.5; 
    const finalY = isRaised ? initialY : liftHeight;
    const action = isRaised ? 'Menurunkan' : 'Mengangkat';
    
    showStatus(`🏗️ Memulai animasi ${action} kontainer dan isinya...`, false);

    const duration = 2000; // Durasi animasi (ms)
    let liftStartTime = Date.now();

    function liftLoop() {
        const elapsedTime = Date.now() - liftStartTime;
        const progress = Math.min(1, elapsedTime / duration);
        
        // Easing function (misalnya: ease-in-out)
        const smoothProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Hitung pergeseran Y (dari 0 ke finalY)
        const shiftY = initialY + (finalY - initialY) * smoothProgress;
        
        // Terapkan pergeseran Y ke semua objek yang akan diangkat
        itemsToLift.forEach(mesh => {
            if (mesh.name === 'ContainerFrame') {
                // Wadah: Y base adalah setengah tingginya (H/2)
                mesh.position.y = (CONTAINER_DIMENSIONS.height / 2) + shiftY;
            } else {
                // Roll: Y base adalah setengah panjangnya (L/2)
                mesh.position.y = mesh.userData.targetY + shiftY;
            }
        });

        // Pindahkan Spreader Bar dan tali utama crane (Asumsi craneGroup sudah menjadi Reference Point)
        const spreader = craneGroup.getObjectByName('SpreaderBar');
        if (spreader) {
            // Spreader bar perlu bergerak bersama kontainer + offset awalnya (containerHeight + 0.5)
            // Offset Awal Spreader Bar: ContainerHeight/2 + ContainerHeight/2 + 0.5 (hanya untuk visual, tidak perlu terlalu akurat)
            const initialSpreaderY = CONTAINER_DIMENSIONS.height + 0.5;
            spreader.position.y = initialSpreaderY + shiftY;
        }


        if (progress < 1) {
            requestAnimationFrame(liftLoop);
        } else {
            showStatus(`🏗️ Kontainer Selesai **${action}**!`, false);
        }
    }
    
    // Panggil animasi hanya jika crane terlihat
    if (craneActive) {
        liftLoop();
    }
}


// --- FUNGSI BARU: Perhitungan Volume dan Berat Roll ---
/**
 * Menghitung volume dan berat roll berdasarkan dimensi dan GSM (Gram per Square Meter).
 * Rumus yang digunakan (berdasarkan permintaan pengguna):
 * 1. Volume Silinder (Roll) V = π * r^2 * h
 * 2. Panjang Kertas (L_sheet) = (π * (R_roll^2 - R_core^2)) / (ketebalan kertas)
 * 3. Berat = (GSM / 1000) * lebar (L) * panjang_kertas (L_sheet)
 * * Catatan:
 * - D = diameter roll (meter), L = panjang roll (meter)
 * - R_roll = D / 2
 * - R_core (inti) di hardcode menjadi 38mm = 0.038 meter (standar industri)
 * - GSM diambil dari deskripsi material.
 * - Ketebalan Kertas (T_paper) di hardcode menjadi 0.000125 meter (125 mikron) (berdasarkan contoh rumus)
 * - Lebar (L) pada rumus Berat adalah Panjang Roll (meter)
 */
function calculateRollMetrics(D, L, GSM) {
    const R_roll = D / 2;
    const R_core = 0.038; // 38mm core standard
    const T_paper = 0.000125; // 125 mikron (berdasarkan contoh)
    
    // 1. Volume Roll (silinder penuh) V = π * R_roll^2 * L (L adalah Tinggi Silinder)
    const volume = Math.PI * R_roll * R_roll * L;
    
    // 2. Panjang Kertas (L_sheet) (Meter)
    // L_sheet = (π * (R_roll^2 - R_core^2)) / T_paper
    const L_sheet = (Math.PI * (R_roll * R_roll - R_core * R_core)) / T_paper;
    
    // 3. Berat Roll (Kilogram)
    // Berat = (GSM / 1000) * lebar (L) * panjang_kertas (L_sheet)
    const weightKg = (GSM / 1000) * L * L_sheet; 
    
    return {
        volume: volume,
        L_sheet: L_sheet,
        weightKg: weightKg
    };
}
// --- AKHIR FUNGSI PERHITUNGAN ROLL ---


// --- 4. LOGIKA MATERIAL INTERAKTIF ---

/**
 * Mencari detail material di koleksi 'materials' berdasarkan ID.
 * *** REVISI: Override Diameter (D) menjadi 1.2m, Panjang (L) diambil dari pola 'W' di Deskripsi, dan AMBIL GSM ***
 */
async function fetchMaterialDetails(materialId, rowElement) {
    const descInput = rowElement.querySelector('.material-desc');
    const dimDisplay = rowElement.querySelector('.dim-display');
    const weightDisplay = rowElement.querySelector('.weight-display'); // << BARU
    const hiddenDimD = rowElement.querySelector('input[data-dim="D"]');
    const hiddenDimL = rowElement.querySelector('input[data-dim="L"]');
    const hiddenGSM = rowElement.querySelector('input[data-dim="GSM"]'); // << BARU
    
    // Reset tampilan
    descInput.value = 'Mencari...';
    dimDisplay.textContent = '...';
    weightDisplay.textContent = '...'; // << BARU
    showStatus('Mencari data material...', false);

    if (!materialId) {
        descInput.value = '';
        dimDisplay.textContent = 'D x L';
        weightDisplay.textContent = 'Berat'; // << BARU
        hiddenDimD.value = 0;
        hiddenDimL.value = 0;
        if(hiddenGSM) hiddenGSM.value = 0; // << BARU
        showStatus('Masukkan ID Material.', true);
        return;
    }

    try {
        const doc = await db.collection('materials').doc(materialId).get();
        let materialData = null;

        if (doc.exists) {
            materialData = doc.data();
        } else {
            // Fallback: Cari menggunakan 'material_number' jika ID dokumen berbeda
            const snapshot = await db.collection('materials').where('material_number', '==', materialId).limit(1).get();
            if (!snapshot.empty) {
                materialData = snapshot.docs[0].data();
            }
        }

        if (materialData) {
            const materialDescription = materialData.description || '';
            
            // 1. Dapatkan Panjang Roll (L) dari Deskripsi menggunakan pola WXXXXMM
            let lengthM = 0; // Panjang Roll L (menjadi Tinggi Roll di Y)
            const widthMatch = materialDescription.match(/W(\d+)\s*MM/i); 
            
            if (widthMatch) {
                lengthM = parseFloat(widthMatch[1]) / 1000; // Konversi W mm ke meter
            }
            
            // 2. Dapatkan GSM dari Deskripsi (contoh: TLN280, GSM=280)
            let gsmValue = 0;
            const gsmMatch = materialDescription.match(/[A-Z]+(\d+)\s*/i); // Cari huruf besar + angka (misal TLN280)
            if (gsmMatch && gsmMatch[1]) {
                gsmValue = parseInt(gsmMatch[1]);
            }

            // 3. Terapkan Diameter (D) yang di-override (1.2 meter)
            const diameterM = 1.2; // Diameter Roll D (menjadi Lebar Roll di X/Z)
            
            // 4. Validasi
            if (lengthM > 0 && gsmValue > 0) { // << BARU: Cek GSM
                
                // --- PERHITUNGAN BERAT BARU ---
                const metrics = calculateRollMetrics(diameterM, lengthM, gsmValue);
                // -----------------------------
                
                // Perbarui elemen HTML
                descInput.value = materialDescription;
                dimDisplay.textContent = `${diameterM.toFixed(2)} x ${lengthM.toFixed(2)} m`;
                
                // Tampilkan Berat (pembulatan 2 desimal)
                const weightTon = metrics.weightKg / 1000;
                weightDisplay.textContent = `${metrics.weightKg.toFixed(0)} kg (${weightTon.toFixed(2)} ton)`; // << BARU
                
                // Simpan nilai dimensi baru di hidden input untuk visualisasi
                hiddenDimD.value = diameterM;
                hiddenDimL.value = lengthM;
                hiddenGSM.value = gsmValue; // Simpan GSM untuk referensi
                
                // Simpan juga Berat (Kg) untuk digunakan dalam visualisasi/laporan (jika diperlukan)
                const hiddenWeightKg = rowElement.querySelector('input[data-dim="WeightKg"]');
                if (hiddenWeightKg) hiddenWeightKg.value = metrics.weightKg; 

                showStatus('✅ Data material ditemukan. Dimensi di-override (D=1.2m, L=W). Berat dikalkulasi.', false);
            } else {
                // Gagal memparsing W (Panjang Roll L) atau GSM
                descInput.value = materialDescription;
                dimDisplay.textContent = 'D x L';
                weightDisplay.textContent = 'Berat'; // << BARU
                hiddenDimD.value = 0;
                hiddenDimL.value = 0;
                if(hiddenGSM) hiddenGSM.value = 0; // << BARU
                showStatus(`❌ Roll ID ${materialId}: Gagal menemukan dimensi W (Panjang Roll) atau GSM di deskripsi.`, true);
            }
        } else {
            descInput.value = 'Material TIDAK DITEMUKAN';
            dimDisplay.textContent = 'D x L';
            weightDisplay.textContent = 'Berat'; // << BARU
            hiddenDimD.value = 0;
            hiddenDimL.value = 0;
            if(hiddenGSM) hiddenGSM.value = 0; // << BARU
            showStatus(`❌ Material ID ${materialId} tidak ditemukan di database.`, true);
        }

    } catch (error) {
        console.error('Error fetching material details:', error);
        descInput.value = 'ERROR!';
        dimDisplay.textContent = 'D x L';
        weightDisplay.textContent = 'Berat'; // << BARU
        showStatus('❌ Error koneksi ke database.', true);
    }
}

/**
 * Menambahkan baris input material baru.
 */
function addMaterialItem() {
    const row = document.createElement('div');
    row.className = 'material-item';
    // MENGHILANGKAN style inline di hidden input
    row.innerHTML = `
        <input type="text" class="material-id" placeholder="Material ID" value="">
        <input type="text" class="material-desc" placeholder="Deskripsi" readonly>
        <input type="number" class="quantity" placeholder="Jml" value="1" min="1">
        <div class="dim-display">D x L</div>
        <div class="weight-display">Berat</div> <button class="remove-material-btn">X</button>
        <input type="hidden" data-dim="D" value="0">
        <input type="hidden" data-dim="L" value="0">
        <input type="hidden" data-dim="GSM" value="0"> <input type="hidden" data-dim="WeightKg" value="0"> `;

    // 1. Tambahkan event listener untuk Material ID (ketika fokus hilang/enter)
    const materialIdInput = row.querySelector('.material-id');
    materialIdInput.addEventListener('change', (e) => {
        fetchMaterialDetails(e.target.value.trim(), row);
    });
    
    // 2. Tambahkan event listener untuk tombol hapus
    row.querySelector('.remove-material-btn').addEventListener('click', () => {
        row.remove();
        showStatus('Baris input dihapus.', false);
    });

    materialListDiv.appendChild(row);
    materialIdInput.focus(); // Fokus ke baris baru
}

/**
 * Mengambil semua item dari input field dan memicunya ke fungsi visualisasi.
 */
function visualizePlannerItems() {
    const itemRows = materialListDiv.querySelectorAll('.material-item');
    const itemsToVisualize = [];
    let isValid = true;
    let totalWeightKg = 0; // << BARU: Hitung total berat

    itemRows.forEach(row => {
        const materialId = row.querySelector('.material-id').value.trim();
        const quantity = parseInt(row.querySelector('.quantity').value);
        const diameter = parseFloat(row.querySelector('input[data-dim="D"]').value);
        const length = parseFloat(row.querySelector('input[data-dim="L"]').value);
        // << BARU: Ambil GSM dan Berat
        const gsm = parseFloat(row.querySelector('input[data-dim="GSM"]').value); 
        const weightKg = parseFloat(row.querySelector('input[data-dim="WeightKg"]').value);
        // ------------------------------------
        
        // Validasi
        if (!materialId) {
            return; // Abaikan baris kosong
        }
        if (isNaN(quantity) || quantity <= 0) {
            showStatus(`❌ Roll ${materialId}: Jumlah (Qty) harus > 0.`, true);
            isValid = false;
            return;
        }
        if (isNaN(diameter) || diameter <= 0 || isNaN(length) || length <= 0 || isNaN(gsm) || gsm <= 0 || isNaN(weightKg) || weightKg <= 0) {
            showStatus(`❌ Roll ${materialId} tidak memiliki dimensi/berat/GSM yang valid. Harap periksa database Material dan format 'W'/'GSM' di deskripsi.`, true);
            isValid = false;
            return;
        }

        itemsToVisualize.push({
            itemId: materialId,
            diameter: diameter,
            length: length,
            quantity: quantity,
            weightKg: weightKg // << BARU
        });
        
        // Hitung total berat
        totalWeightKg += weightKg * quantity; // << BARU
    });

    if (!isValid) return;

    if (itemsToVisualize.length === 0) {
        showStatus('Tidak ada item untuk divisualisasikan.', true);
        visualizeItems([]);
        return;
    }
    
    // Panggil fungsi visualisasi utama
    const totalWeightTon = totalWeightKg / 1000;
    showStatus(`🚀 Memproses visualisasi ${itemsToVisualize.length} jenis roll. Total Berat: ${totalWeightKg.toFixed(0)} kg (${totalWeightTon.toFixed(2)} ton).`, false);
    visualizeItems(itemsToVisualize);
}

/**
 * Fungsi untuk mencoba memparsing Diameter (D) dan Panjang (L) dari string deskripsi.
 * CATATAN: Fungsi ini HANYA digunakan oleh importMaterialFromPaste untuk menyimpan data di Firestore.
 * Tidak dimodifikasi agar data asli di Firestore tetap terjaga.
 */
function parseDimensionsFromDescription(description) {
    let diameter = 0; // Default dalam meter
    let length = 0;   // Default dalam meter

    // POLA 1: Cari 'Angka X Angka MM' (misal: 1000X1000MM, 660X750MM)
    const regex1 = /(\d+)[Xx](\d+)\s*MM/i; 
    const match1 = description.match(regex1);

    if (match1 && match1.length >= 3) {
        // Asumsi: Angka pertama (660/1000) adalah Diameter (D)
        // Angka kedua (750/1000) adalah Panjang Roll (L)
        diameter = parseFloat(match1[1]) / 1000; // Konversi mm ke meter
        length = parseFloat(match1[2]) / 1000;   // Konversi mm ke meter
        return { diameter, length, gsm: 0 }; // GSM tidak diparsing di sini
    } 

    // POLA 2: Cari nilai Diameter (D/W) dan Length (L) terpisah (misal: ...W1400MM L7600MC3...)
    // Mencari angka setelah D/W dan angka setelah L
    const diameterMatch = description.match(/[DW](\d+)\s*MM/i);
    // Mencari 'L' diikuti angka, lalu diikuti oleh huruf besar atau garis miring.
    const lengthMatch = description.match(/L(\d+)(?=[A-Z\s\/])/i) || description.match(/L(\d+)$/i);

    // --- BARU: Cari GSM ---
    let gsmValue = 0;
    const gsmMatch = description.match(/[A-Z]+(\d+)\s*/i); 
    if (gsmMatch && gsmMatch[1]) {
        gsmValue = parseInt(gsmMatch[1]);
    }
    // -----------------------

    if (diameterMatch && lengthMatch) {
        // Jika keduanya ditemukan, ambil nilai dari grup tangkapan (capturing group)
        const parsedDiameterMM = parseFloat(diameterMatch[1]);
        const parsedLengthMM = parseFloat(lengthMatch[1]);

        // Perhitungan Diameter (W)
        diameter = parsedDiameterMM / 1000; // Selalu dibagi 1000 (mm ke meter)

        // Perhitungan Length (L) - Logika khusus untuk L ribuan
        if (parsedLengthMM >= 1000) {
             // Jika nilai Length ribuan (misal 7600), bagi 10,000 (asumsi kelebihan satu nol)
             length = parsedLengthMM / 10000;
        } else {
             // Jika nilai Length normal (ratusan), bagi 1000 (mm ke meter)
             length = parsedLengthMM / 1000;
        }

        return { diameter, length, gsm: gsmValue }; // << BARU: Tambahkan gsm
    }
    
    // Jika tidak ada pola yang cocok, kembalikan 0.
    return { diameter: 0, length: 0, gsm: 0 }; // << BARU: Tambahkan gsm
}


/**
 * Memproses data Excel yang ditempelkan dan mengunggahnya ke Firestore.
 */
async function importMaterialFromPaste() {
    const pasteArea = document.getElementById('excel-paste-area');
    const data = pasteArea.value.trim();

    if (!data) {
        showStatus('❌ Harap tempelkan data dari Excel di kotak di atas.', true);
        return;
    }

    showStatus('⏳ Memproses data...', false);
    
    try {
        // Parsing data yang ditempelkan (asumsi format CSV/TSV)
        const workbook = XLSX.read(data, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Konversi ke array of arrays (cocok untuk data Excel copy-paste)
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        
        let importedCount = 0;
        let skippedInvalidCount = 0;
        let currentBatch = db.batch(); // Menggunakan batch lokal
        const materialsCollection = db.collection('materials');
        
        const processedMaterialIds = new Set(); 

        for (const row of json) {
            // Asumsi: Kolom 1 (indeks 0) adalah Material ID, Kolom 2 (indeks 1) adalah Deskripsi
            const materialId = (row[0] || '').toString().trim();
            const description = (row[1] || '').toString().trim();

            if (!materialId || !description) {
                console.warn(`[SKIP] Baris dilewati: Material ID atau Deskripsi kosong. Baris data: ${row.join(', ')}`);
                skippedInvalidCount++;
                continue;
            }
            
            // 1. Cek Duplikasi (di dalam batch copy-paste yang SAMA)
            if (processedMaterialIds.has(materialId)) {
                console.warn(`[SKIP] Roll ID ${materialId} dilewati: Duplikat di dalam batch upload.`);
                skippedInvalidCount++;
                continue; 
            }

            const { diameter, length, gsm } = parseDimensionsFromDescription(description); // << BARU: Ambil GSM juga
            // CATATAN: Di sini digunakan parseDimensionsFromDescription ASLI
            // Diameter dan Length yang disimpan di database adalah hasil parsing yang lama/asli.

            // 2. VALIDASI DIMENSI
            if (diameter === 0 || length === 0 || gsm === 0) { // << BARU: Validasi GSM
                 console.warn(`[SKIP] Roll ID ${materialId} dilewati: Gagal parsing dimensi/GSM (D/L/GSM=0). Deskripsi: ${description}`);
                 skippedInvalidCount++;
                 continue; // Melewatkan data jika parsing dimensi gagal
            }

            // 3. Tandai ID sebagai sudah diproses
            processedMaterialIds.add(materialId); 
            
            // 4. Masukkan ke Batch
            const docRef = materialsCollection.doc(materialId); 
            currentBatch.set(docRef, {
                material_number: materialId,
                description: description,
                diameter: diameter, 
                length: length,
                gsm: gsm, // << BARU: Simpan GSM
                last_imported: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); 

            importedCount++;
            
            // Firestore memiliki batas 500 operasi per batch.
            if (importedCount % 499 === 0) {
                await currentBatch.commit();
                showStatus(`✔️ ${importedCount} data roll berhasil diunggah. Melanjutkan batch berikutnya...`, false);
                currentBatch = db.batch(); // Buat batch baru
            }
        }

        if (importedCount % 499 !== 0) {
            await currentBatch.commit();
        }
        
        pasteArea.value = ''; // Kosongkan area setelah upload
        showStatus(`🎉 Berhasil mengunggah ${importedCount} data roll material ke Firestore! (Dilewati: ${skippedInvalidCount} data tidak valid/duplikat).`, false);

    } catch (error) {
        console.error('Error saat impor data:', error);
        // Menampilkan pesan error yang lebih jelas di UI
        showStatus(`❌ Gagal mengunggah data. Error detail: ${error.message}. Cek konsol browser untuk rincian: ${error.code || 'Tidak Diketahui'}`, true);
    }
}


// --- 6. LOGIKA VISUALISASI DAN PACKING ---

/** Helper untuk membuat mesh Silinder (Roll) */
function createCylinderMesh(diameter, length, color) {
    const radius = diameter / 2;
    // Roll BERDIRI: Diameter (D) adalah Lebar, Panjang Roll (L) adalah Tinggi (Y)
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 32); 
    const material = new THREE.MeshLambertMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Simpan dimensi asli dalam UserData untuk digunakan saat drag
    mesh.userData = { D: diameter, L: length, targetY: length / 2 }; // Set targetY awal
    
    return mesh;
}

/** Visualisasi dan Algoritma Packing Roll Sederhana */
function visualizeItems(items) {
    // 1. Hapus semua item lama dari scene
    itemsInScene.filter(mesh => mesh !== containerMesh && mesh !== plane).forEach(mesh => scene.remove(mesh)); // Ganti itemsInScene.containerFrame ke containerMesh
    // Kosongkan item yang bukan kerangka/plane
    itemsInScene.splice(itemsInScene.indexOf(containerMesh) + 1, itemsInScene.length); // Hapus semua setelah containerMesh
    
    visualizeContainerFrame(); // Pastikan kerangka kontainer terbaru

    if (!items || items.length === 0) {
        rollsToAnimate = []; // Reset animasi
        return;
    }
    
    const { length: contL, width: contW, height: contH } = CONTAINER_DIMENSIONS;
    
    // 2. Setup Packing State (Roll BERDIRI: Diameter/D di X/Z, Panjang Roll/L di Y/Tinggi)
    let currentX = -(contL / 2); // Mulai dari sisi kiri kontainer
    let currentZ = -(contW / 2); // Mulai dari sisi depan kontainer
    let maxDInRow = 0;          // Diameter terbesar di baris saat ini
    let rollCounter = 0;
    
    // KOSONGKAN LIST ANIMASI SEBELUM MEMULAI BARU
    rollsToAnimate = []; 

    // 3. Iterasi dan Posisikan Roll
    for (const itemType of items) {
        // D adalah diameter roll (dimensi di X/Z)
        // L adalah panjang roll (dimensi di Y/Tinggi)
        const D = itemType.diameter; 
        const L = itemType.length;   
        const Q = itemType.quantity;
        const itemId = itemType.itemId; // << BARU: Ambil ID Material
        
        // << BARU: Ambil warna konsisten untuk ID Material ini >>
        const materialColor = getMaterialColor(itemId); 
        
        if (D <= 0 || L <= 0 || Q <= 0) continue;

        // Cek Roll BERDIRI (Panjang Roll L adalah Tinggi di Sumbu Y)
        if (L > contH) {
             console.warn(`Roll ${itemType.itemId} (Pjg: ${L.toFixed(2)}m) terlalu tinggi untuk kontainer.`);
             showAlertPopup(`maaf guys Roll ${itemType.itemId} (${L.toFixed(2)}m) terlalu tinggi untuk moda ${CONTAINER_DIMENSIONS.name} (T:${contH.toFixed(2)}m). Silahkan pilih moda lain :)`);
             return; 
        }
        
        // Cek Roll BERDIRI (Diameter Roll D harus muat di X dan Z kontainer)
        if (D > contL || D > contW) {
             console.warn(`Roll ${itemType.itemId} (Dia: ${D.toFixed(2)}m) terlalu besar untuk X/Z kontainer.`);
             showAlertPopup(`maaf guys Roll ${itemType.itemId} (${D.toFixed(2)}m) terlalu lebar (D) untuk moda ${CONTAINER_DIMENSIONS.name} (L/W:${contW.toFixed(2)}m). Silahkan pilih moda lain :)`);
             return; 
        }

        for (let i = 0; i < Q; i++) {
            rollCounter++;
            
            // << BARU: Gunakan materialColor yang sudah didapatkan >>
            const rollMesh = createCylinderMesh(D, L, materialColor); 
            
            // --- Cek Batas Panjang Kontainer (X) ---
            // Di baris saat ini, item bergerak di X, menggunakan Diameter (D) sebagai lebar
            if (currentX + D > (contL / 2)) { 
                // Pindah ke baris baru (geser di Z)
                currentX = -(contL / 2); 
                currentZ += maxDInRow; 
                maxDInRow = 0; 
                
                // Cek apakah baris baru muat dalam Lebar Kontainer (Z)
                // Baris baru menggunakan Diameter Roll (D) sebagai lebar di Z
                if (currentZ + D > (contW / 2)) {
                    
                    // === PESAN POP-UP KETIDAKMUATAN ===
                    showAlertPopup("maaf guys barang tidak muat, silahkan pilih moda lain :)"); 
                    // ===================================
                    
                    rollsToAnimate = []; // Reset animasi
                    return; 
                }
            }
            
            // Posisi Roll (Roll Berdiri):
            // X: Dari titik awal + (Diameter Roll / 2)
            const xPos = currentX + (D / 2);   
            // Y: Lantai + (Panjang Roll / 2) -> Panjang Roll adalah L (Tinggi)
            const targetYPos = 0 + (L / 2); 
            // Z: Dari titik awal + (Diameter Roll / 2)
            const zPos = currentZ + (D / 2);   

            // POSISI AWAL untuk animasi (10 meter di atas)
            rollMesh.position.set(xPos, 10, zPos); 
            // SIMPAN target Y di userData
            rollMesh.userData.targetY = targetYPos;


            scene.add(rollMesh);
            itemsInScene.push(rollMesh);
            
            // Tambahkan ke daftar yang perlu dianimasikan
            rollsToAnimate.push(rollMesh);


            // Update posisi untuk roll berikutnya di baris yang sama
            currentX += D; // Roll berikutnya diletakkan di samping, menggunakan Diameter (D) sebagai lebar
            maxDInRow = Math.max(maxDInRow, D); // Diameter Roll adalah yang menentukan lebar di Z
        }
    }
    showStatus(`✅ Visualisasi selesai. Total ${rollCounter} roll berhasil ditempatkan (dianimasikan). Roll kini berdiri.`, false);
    
    // Tampilkan tombol Move setelah visualisasi berhasil
    document.getElementById('move-btn').style.display = 'inline-block';
    document.getElementById('save-btn').style.display = 'none';
    isMoveModeActive = false;
}

// FUNGSI BARU: Mengaktifkan mode Move (Drag-and-Drop)
function activateMoveMode() {
    isMoveModeActive = true;
    controls.enabled = true; // Pastikan kontrol kamera aktif untuk melihat dari sudut berbeda
    showStatus('🖱️ Mode Pindah Aktif: Klik & tahan roll untuk memindahkannya. Tekan "Selesai Pindah" untuk mengunci.', false);
    document.getElementById('move-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'inline-block';
}

// FUNGSI BARU: Menyimpan posisi dan mengunci
function deactivateMoveMode() {
    isMoveModeActive = false;
    draggableObject = null;
    controls.enabled = true; // Pastikan kontrol kamera kembali aktif
    showStatus('🔒 Posisi Pemuatan Dikunci. Gunakan tombol "Pindah Roll" untuk memodifikasi.', false);
    document.getElementById('move-btn').style.display = 'inline-block';
    document.getElementById('save-btn').style.display = 'none';
    
    console.log("Posisi roll berhasil dikunci/disimpan.");
}


// --- 7. EVENT LISTENERS (UPDATE) ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Inisialisasi 3D
    initThreeJS();
    visualizeContainerFrame(); 

    // 2. Inisialisasi satu baris input saat aplikasi dimuat
    addMaterialItem();

    // 3. Event Listener untuk Tambah, Visualisasi, Move, dan Save
    document.getElementById('add-material-btn').addEventListener('click', addMaterialItem);
    document.getElementById('visualize-btn').addEventListener('click', visualizePlannerItems);
    
    // Event Listener untuk Move/Save
    document.getElementById('move-btn').addEventListener('click', activateMoveMode);
    document.getElementById('save-btn').addEventListener('click', deactivateMoveMode);
    
    // [BARU] Event Listener untuk Crane
    document.getElementById('crane-btn').addEventListener('click', () => {
        if (!craneActive) {
            // Hanya aktifkan visualisasi crane (sekaligus set craneActive = true)
            toggleCraneVisual();
        } else {
            // Jika sudah aktif, jalankan animasinya (angkat/turunkan)
            animateCraneLift();
        }
    });

    // 4. Event Listener untuk Impor
    document.getElementById('import-btn').addEventListener('click', importMaterialFromPaste);

    // 5. Event Listener BARU untuk Pemilihan Moda (Dropdown)
    document.getElementById('moda-selector').addEventListener('change', (e) => {
        changeContainerModa(e.target.value);
    });
    
    // Inisialisasi awal display moda
    changeContainerModa('40hc'); // Panggil sekali untuk memastikan tampilan awal
});