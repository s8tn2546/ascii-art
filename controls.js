export function bindControls(state, elements, onAnyUpdate) {
  const mapping = [
    {
      control: elements.densityRange,
      output: elements.densityValue,
      key: "density",
      parse: (value) => Number(value)
    },
    {
      control: elements.quantityRange,
      output: elements.quantityValue,
      key: "quantity",
      parse: (value) => Number(value)
    },
    {
      control: elements.noiseRange,
      output: elements.noiseValue,
      key: "noise",
      parse: (value) => Number(value)
    }
  ];

  for (const item of mapping) {
    item.control.addEventListener("input", () => {
      state.controls[item.key] = item.parse(item.control.value);
      item.output.textContent = item.control.value;
      item.control.setAttribute("aria-valuenow", item.control.value);
      onAnyUpdate();
    });

    item.control.setAttribute("aria-valuenow", item.control.value);
  }

  elements.textureSelect.addEventListener("change", () => {
    state.controls.texture = elements.textureSelect.value;
    onAnyUpdate();
  });

  elements.colorModeSelect.addEventListener("change", () => {
    state.controls.colorMode = elements.colorModeSelect.value;
    onAnyUpdate();
  });

  elements.tintPicker.addEventListener("input", () => {
    state.controls.tint = elements.tintPicker.value;
    onAnyUpdate();
  });
}
