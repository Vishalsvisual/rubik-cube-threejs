import Rubiks from "./rubiks/index";


window.onload = () => {
    const container = document.getElementById("container");
    const orderChangeEle = document.getElementById("order-select") as HTMLSelectElement;
    const disorderEle = document.getElementById("disorder") as HTMLButtonElement;
    const restore = document.getElementById("restore") as HTMLButtonElement;
    
    if (container) {
        const rubiks = new Rubiks(container);

        orderChangeEle.addEventListener("change", (event) => {
            const value = (event.target! as HTMLSelectElement).value;

            rubiks.setOrder(parseInt(value));
        })

        disorderEle.addEventListener("click", () => {
            rubiks.disorder();
        });

        restore.addEventListener("click", () => {
            const ok = window.confirm("After restoring, you cannot recover！");

            if (ok) {
                rubiks.restore();
            }
        });
    }
};
