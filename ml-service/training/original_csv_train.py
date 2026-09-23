# Original experiment, step 2: train and compare models on the team's first dataset (not used by the app).
#
# Every model is trained twice:
#   A) on the Kaggle benchmark alone (the "single benchmark" most papers use)
#   B) on our consolidated multi-source dataset
# Both use the same stratified 80/20 train/test split (random_state=42),
# and we report accuracy AND macro-averaged F1. Results: artifacts/original_csv_results.csv
#
# Run from the ml-service folder:  python training/original_csv_train.py

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
from sklearn.naive_bayes import GaussianNB
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    StackingClassifier,
)

FEATURES = ["N", "P", "K", "pH", "Temperature", "Humidity", "Rainfall"]


def make_stacking_model():
    # Base models each give a probability for every crop.
    # Logistic Regression (meta-model) combines those probabilities into the final answer.
    base_models = [
        ("random_forest", RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)),
        ("extra_trees", ExtraTreesClassifier(n_estimators=300, random_state=42, n_jobs=-1)),
        ("gradient_boosting", HistGradientBoostingClassifier(random_state=42)),
        ("knn", KNeighborsClassifier(n_neighbors=7)),
    ]
    return StackingClassifier(
        estimators=base_models,
        final_estimator=LogisticRegression(max_iter=2000),
        stack_method="predict_proba",
        cv=5,
        n_jobs=-1,
    )


def all_models():
    return {
        "Naive Bayes": GaussianNB(),
        "Logistic Regression": LogisticRegression(max_iter=2000),
        "KNN": KNeighborsClassifier(n_neighbors=7),
        "Decision Tree": DecisionTreeClassifier(random_state=42),
        "MLP": MLPClassifier(hidden_layer_sizes=(64, 64), max_iter=1000, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1),
        "Stacking (RF+ET+HGB+KNN -> LR)": make_stacking_model(),
    }


def evaluate(dataset_name, df):
    X_train, X_test, y_train, y_test = train_test_split(
        df[FEATURES], df["Crop"], test_size=0.2, stratify=df["Crop"], random_state=42
    )
    results = []
    trained = {}
    for name, model in all_models().items():
        model.fit(X_train, y_train)
        predicted = model.predict(X_test)
        acc = accuracy_score(y_test, predicted)
        f1 = f1_score(y_test, predicted, average="macro")
        print(f"  {name:32s} accuracy={acc:.4f}  macro-F1={f1:.4f}")
        results.append({"dataset": dataset_name, "model": name, "accuracy": round(acc, 4), "macro_f1": round(f1, 4)})
        trained[name] = model
    return results, trained, X_test, y_test


benchmark = pd.read_csv("data/processed/benchmark_kaggle.csv")
consolidated = pd.read_csv("data/processed/consolidated.csv")

print(f"A) Kaggle benchmark only ({len(benchmark)} rows, {benchmark['Crop'].nunique()} crops)")
results_a, _, _, _ = evaluate("Kaggle benchmark", benchmark)

print(f"\nB) Consolidated multi-source ({len(consolidated)} rows, {consolidated['Crop'].nunique()} crops)")
results_b, trained, X_test, y_test = evaluate("Consolidated", consolidated)

# Side-by-side table: how much does each model drop when we leave the single benchmark?
table = pd.DataFrame(results_a + results_b)
table.to_csv("artifacts/original_csv_results.csv", index=False)
wide = table.pivot(index="model", columns="dataset", values=["accuracy", "macro_f1"])
wide[("drop", "accuracy")] = wide[("accuracy", "Kaggle benchmark")] - wide[("accuracy", "Consolidated")]
wide[("drop", "macro_f1")] = wide[("macro_f1", "Kaggle benchmark")] - wide[("macro_f1", "Consolidated")]
print("\n", wide.round(4).to_string())

# How does the stacking model do on each source inside the test set?
stack = trained["Stacking (RF+ET+HGB+KNN -> LR)"]
test_sources = consolidated.loc[X_test.index, "Source"]
predicted = stack.predict(X_test)
print("\nStacking model, test set split by source:")
for source in test_sources.unique():
    rows = test_sources == source
    acc = accuracy_score(y_test[rows], predicted[rows])
    f1 = f1_score(y_test[rows], predicted[rows], average="macro")
    print(f"  {source:40s} rows={rows.sum():5d}  accuracy={acc:.4f}  macro-F1={f1:.4f}")
