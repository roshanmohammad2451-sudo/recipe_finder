// Global Data
let allRecipes = [];
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let currentFilter = {
    type: 'all',    // 'all', 'veg', 'non-veg'
    difficulty: 'all', // 'all', 'easy', 'medium', 'hard'
    time: 'all',       // 'all', 'under30', 'over30'
    search: '',
    showFavorites: false
};

// DOM Elements
const recipeGrid = document.getElementById('recipeGrid');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.filter-btn');
const difficultyFilter = document.getElementById('difficultyFilter');
const timeFilter = document.getElementById('timeFilter');
const showFavBtn = document.getElementById('showFavBtn');
const themeToggle = document.getElementById('themeToggle');
const loader = document.getElementById('loader');
const statusMessage = document.getElementById('statusMessage');
const modalOverlay = document.getElementById('recipeModal');
const closeModalBtn = document.getElementById('closeModal');
const modalContent = document.getElementById('modalContent');
let searchTimeout;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchRecipes();
    setupEventListeners();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
}

// Fetch Data
async function fetchRecipes(query = '') {
    showLoader();
    try {
        let recipesMap = new Map(); // Use Map to prevent duplicates
        
        if (!query) {
            let url = 'https://www.themealdb.com/api/json/v1/1/search.php?s=';
            let response = await fetch(url);
            let data = await response.json();
            if (data.meals) {
                data.meals.forEach(m => recipesMap.set(m.idMeal, formatMeal(m)));
            }
        } else {
            // Split query by comma or space
            const ingredients = query.split(/[\s,]+/).filter(i => i.trim() !== '');
            
            // Try ingredient search for all parsed ingredients
            const ingredientPromises = ingredients.map(async (ing) => {
                const url = 'https://www.themealdb.com/api/json/v1/1/filter.php?i=' + ing;
                const response = await fetch(url);
                const data = await response.json();
                return data.meals || [];
            });
            
            const ingredientResults = await Promise.all(ingredientPromises);
            let foundAnyIngredient = false;
            
            // Flatten and add to map
            ingredientResults.forEach(mealsList => {
                if (mealsList.length > 0) foundAnyIngredient = true;
                mealsList.forEach(m => {
                    if (!recipesMap.has(m.idMeal)) {
                        recipesMap.set(m.idMeal, formatMeal(m));
                    }
                });
            });
            
            // Fallback: If absolutely no ingredient matches were found, try a single name search
            if (!foundAnyIngredient) {
                const url = 'https://www.themealdb.com/api/json/v1/1/search.php?s=' + query;
                const response = await fetch(url);
                const data = await response.json();
                if (data.meals) {
                    data.meals.forEach(m => recipesMap.set(m.idMeal, formatMeal(m)));
                }
            }
        }
        
        allRecipes = Array.from(recipesMap.values());
        applyFilters();
    } catch (error) {
        showError('Oops! Unable to load recently. Try adjusting your search query.');
        console.error(error);
    } finally {
        hideLoader();
    }
}

function formatMeal(meal) {
    let ingredients = [];
    let instructions = [];
    let isVeg = true;
    
    // Comprehensive list of non-vegetarian keywords to check against ingredients
    const nonVegKeywords = [
        'chicken', 'beef', 'mutton', 'pork', 'lamb', 'fish', 'salmon', 'tuna', 
        'shrimp', 'prawn', 'crab', 'lobster', 'seafood', 'bacon', 'ham', 
        'prosciutto', 'sausage', 'chorizo', 'meat', 'veal', 'turkey', 'duck',
        'egg', 'eggs', 'gelatin', 'anchovy', 'anchovies', 'oyster'
    ];

    if (meal.strIngredient1) {
        for (let i = 1; i <= 20; i++) {
            const ing = meal[`strIngredient${i}`];
            const measure = meal[`strMeasure${i}`];
            if (ing && ing.trim() !== '') {
                const ingredientStr = ing.trim();
                ingredients.push(`${measure ? measure.trim() : ''} ${ingredientStr}`);
                
                // Check if this ingredient makes the meal non-vegetarian
                const lowerIng = ingredientStr.toLowerCase();
                if (nonVegKeywords.some(keyword => lowerIng.includes(keyword))) {
                    isVeg = false;
                }
            }
        }
    } else {
        // If we don't have ingredient details yet (from filter.php), 
        // we tentatively check the title, but we will confirm after full load
        const lowerTitle = (meal.strMeal || '').toLowerCase();
        if (nonVegKeywords.some(keyword => lowerTitle.includes(keyword))) {
            isVeg = false;
        }
    }
    
    if (meal.strInstructions) {
        instructions = meal.strInstructions.split(/[\r\n]+/).filter(line => line.trim() !== '');
    }
    
    // If the category explicitly says it's not veg/vegan and it's something else like Beef, respect it
    if (meal.strCategory && !['Vegetarian', 'Vegan', 'Side', 'Dessert', 'Starter'].includes(meal.strCategory)) {
        isVeg = false;
    }
    
    const idNum = parseInt(meal.idMeal) || 0;
    const prepTime = 15 + (idNum % 4) * 10;
    const diffs = ['Easy', 'Medium', 'Hard'];
    const difficulty = diffs[idNum % 3];

    return {
        id: meal.idMeal,
        title: meal.strMeal,
        image: meal.strMealThumb,
        ingredients: ingredients,
        instructions: instructions,
        isVegetarian: isVeg,
        prepTime: prepTime,
        difficulty: difficulty,
        hasDetails: !!meal.strInstructions 
    };
}

// Event Listeners
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        currentFilter.search = query;
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchRecipes(query);
        }, 500);
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter.type = e.target.getAttribute('data-filter');
            applyFilters();
        });
    });

    difficultyFilter.addEventListener('change', (e) => {
        currentFilter.difficulty = e.target.value;
        applyFilters();
    });

    timeFilter.addEventListener('change', (e) => {
        currentFilter.time = e.target.value;
        applyFilters();
    });

    showFavBtn.addEventListener('click', () => {
        currentFilter.showFavorites = !currentFilter.showFavorites;
        showFavBtn.classList.toggle('active');
        applyFilters();
    });

    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
            closeModal();
        }
    });
}

// Filtering Logic
function applyFilters() {
    let filtered = allRecipes.filter(recipe => {
        // Robust filtering based on evaluated `isVegetarian` property
        const typeMatch = currentFilter.type === 'all' || 
            (currentFilter.type === 'veg' && recipe.isVegetarian) ||
            (currentFilter.type === 'non-veg' && !recipe.isVegetarian);
            
        const difficultyMatch = currentFilter.difficulty === 'all' || 
            recipe.difficulty.toLowerCase() === currentFilter.difficulty;
            
        let timeMatch = true;
        if (currentFilter.time === 'under30') {
            timeMatch = recipe.prepTime < 30;
        } else if (currentFilter.time === 'over30') {
            timeMatch = recipe.prepTime >= 30;
        }

        const favMatch = !currentFilter.showFavorites || favorites.includes(recipe.id);
        
        return typeMatch && difficultyMatch && timeMatch && favMatch;
    });

    renderRecipes(filtered);
}

// UI Rendering
function renderRecipes(recipes) {
    recipeGrid.innerHTML = '';
    
    if (recipes.length === 0) {
        showError(currentFilter.showFavorites && favorites.length === 0 
            ? "You haven't added any favorite recipes yet." 
            : "No recipes found. Try a different ingredient like 'chicken' or 'egg'.");
        return;
    }
    
    hideError();

    recipes.forEach(recipe => {
        const isFav = favorites.includes(recipe.id);
        
        const card = document.createElement('div');
        card.className = 'recipe-card glass-effect';
        card.innerHTML = `
            <div class="card-image-wrapper">
                <span class="card-badge ${recipe.isVegetarian ? 'veg' : ''}" style="display: ${recipe.hasDetails ? 'block' : 'none'}">
                    ${recipe.isVegetarian ? 'Vegetarian' : 'Non-Veg'}
                </span>
                <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${recipe.id}">
                    <i class="fa-solid fa-heart"></i>
                </button>
                <img src="${recipe.image}" alt="${recipe.title}" class="card-img" loading="lazy">
            </div>
            <div class="card-content">
                <h3 class="card-title">${recipe.title}</h3>
                <div class="card-meta">
                    <span><i class="fa-regular fa-clock"></i> ${recipe.prepTime} mins</span>
                    <span><i class="fa-solid fa-chart-simple"></i> ${recipe.difficulty}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if(e.target.closest('.fav-btn')) return;
            openModal(recipe);
        });

        const favBtn = card.querySelector('.fav-btn');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(recipe.id, favBtn);
        });

        recipeGrid.appendChild(card);
    });
}

// Favorites Logic
function toggleFavorite(id, btnElement) {
    const index = favorites.indexOf(id);
    if (index === -1) {
        favorites.push(id);
        btnElement.classList.add('active');
        btnElement.style.transform = 'scale(1.3)';
        setTimeout(() => btnElement.style.transform = '', 200);
    } else {
        favorites.splice(index, 1);
        btnElement.classList.remove('active');
        if (currentFilter.showFavorites) {
            applyFilters();
        }
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

// Modal Logic
async function openModal(recipe) {
    const isFav = favorites.includes(recipe.id);
    
    if (!recipe.hasDetails) {
        document.body.style.cursor = 'wait';
        try {
            const res = await fetch('https://www.themealdb.com/api/json/v1/1/lookup.php?i=' + recipe.id);
            const data = await res.json();
            if (data.meals && data.meals[0]) {
                const fullMeal = formatMeal(data.meals[0]);
                Object.assign(recipe, fullMeal);
                recipe.hasDetails = true;
                
                // Since category is now known, update grid display if needed (in case they close it)
                const cardBadge = recipeGrid.querySelector(`.fav-btn[data-id="${recipe.id}"]`).parentElement.querySelector('.card-badge');
                if (cardBadge) {
                    cardBadge.style.display = 'block';
                    if (recipe.isVegetarian) cardBadge.classList.add('veg');
                    cardBadge.textContent = recipe.isVegetarian ? 'Vegetarian' : 'Non-Veg';
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            document.body.style.cursor = 'default';
        }
    }
    
    modalContent.innerHTML = `
        <div class="modal-hero">
            <button class="fav-btn ${isFav ? 'active' : ''}" style="top: 1rem; right: 4rem; z-index: 10;" data-id="${recipe.id}">
                <i class="fa-solid fa-heart"></i>
            </button>
            <img src="${recipe.image}" alt="${recipe.title}">
            <span class="card-badge ${recipe.isVegetarian ? 'veg' : ''}">
                ${recipe.isVegetarian ? 'Vegetarian' : 'Non-Veg'}
            </span>
        </div>
        <div class="modal-body">
            <h2 class="modal-title">${recipe.title}</h2>
            <div class="modal-meta">
                <span><i class="fa-regular fa-clock"></i> ${recipe.prepTime} mins</span>
                <span><i class="fa-solid fa-chart-simple"></i> ${recipe.difficulty} level</span>
            </div>
            
            <div class="modal-grid">
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-basket-shopping"></i> Ingredients</h3>
                    <ul class="ingredients-list">
                        ${recipe.ingredients.length > 0 ? recipe.ingredients.map(ing => `<li>${ing}</li>`).join('') : '<li>Ingredients not available.</li>'}
                    </ul>
                </div>
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-list-ol"></i> Instructions</h3>
                    <ol class="instructions-list">
                        ${recipe.instructions.length > 0 ? recipe.instructions.map(inst => `<li>${inst}</li>`).join('') : '<li>Instructions not available.</li>'}
                    </ol>
                </div>
            </div>
        </div>
    `;

    const modalFavBtn = modalContent.querySelector('.fav-btn');
    modalFavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(recipe.id, modalFavBtn);
        if (!currentFilter.showFavorites) {
            const gridBtn = recipeGrid.querySelector(`.fav-btn[data-id="${recipe.id}"]`);
            if (gridBtn) {
                if (favorites.includes(recipe.id)) gridBtn.classList.add('active');
                else gridBtn.classList.remove('active');
            }
        }
    });

    document.body.style.overflow = 'hidden';
    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function showLoader() {
    loader.classList.remove('hidden');
    recipeGrid.innerHTML = '';
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showError(msg) {
    statusMessage.textContent = msg;
    statusMessage.classList.remove('hidden');
}

function hideError() {
    statusMessage.classList.add('hidden');
}
