from sklearn.model_selection import train_test_split

from data.synthetic import generate_data, DEPTHS
from reconstruction.model import TemperatureReconstructor
from validation.metrics import evaluate


def main():
    X, y = generate_data()

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42
    )

    model = TemperatureReconstructor()
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    results = evaluate(
        y_test,
        predictions,
        DEPTHS
    )

    print("\nOceanEmbed Reconstruction")
    print("=" * 50)
    print(f"Training samples : {len(X_train)}")
    print(f"Test samples     : {len(X_test)}")
    print(f"Input variables  : {X.shape[1]}")
    print(f"Depth levels     : {y.shape[1]}")

    print("\nDepth Validation")
    print("-" * 50)
    print(f"{'Depth':>8} {'RMSE':>12} {'Correlation':>14}")

    for result in results:
        print(
            f"{result['depth']:>6}m "
            f"{result['rmse']:>12.4f} "
            f"{result['correlation']:>14.4f}"
        )


if __name__ == "__main__":
    main()