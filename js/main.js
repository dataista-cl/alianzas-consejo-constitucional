Promise.all([
  d3.csv("data/votos.csv"),
  d3.csv("data/cupos.csv"),
  d3.json("data/alianzas.json"),
  d3.json("data/partidos.json"),
  d3.json("js/es-ES.json")
]).then(function(data){

  const votos = data[0],
    cupos = data[1],
    alianzas = data[2],
    partidos = data[3];

  d3.formatDefaultLocale(data[4]);

  const partidosDict = {},
    alianzasDict = {};
  
  partidos.forEach(partido => {
    let colorFill = d3.color(partido.color);
    colorFill.opacity = 0.5;
    partidosDict[partido.nombre] = {
      "colorFill": colorFill,
      "colorStroke": d3.color(partido.color),
      "nombreCorto": partido.nombreCorto
    }
  });

  let overCircle = null;

  votos.forEach(d => {
    d.partido = d.partido.trim();
    d.votos = +d.votos;
  });

  cupos.forEach(cupo => {
    cupo.cupos = +cupo.cupos;
  })

  const width = 1000,
    height = 400;

  const margin = {"top": 20};

  const svg = d3.select("#viz")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("font", "10px sans-serif")
    .attr("text-anchor", "middle");

  function updatePlot(alianzasData) {

    // D'Hondt
    const mostVotes = cupos.map(cupo => {

      // Calculate votes per alianza for each region
      const alianzaVotes = alianzasData.map(alianza => {
        const votosAlianza = votos.filter(voto => (voto.region === cupo.region) & (alianza.partidos.includes(voto.partido)))
          .reduce((a,b) => a + b.votos, 0);

        return {
          "nombre": alianza.nombre,
          "votosTotales": votosAlianza
        }
      });

      // Simulates D'Hondt voting by diving alianza votes per number of seats
      const allVotes = alianzaVotes.map(alianza => {
        return d3.range(1, cupo.cupos + 1).map(idx => {
            return {
              "nombre": alianza.nombre,
              "votos": alianza.votosTotales / idx
            }
          })
      }).flat();

      // Select the most voted based on number of seats
      return allVotes.sort((a,b) => b.votos - a.votos).slice(0, cupo.cupos);
    }).flat();

    alianzasData.forEach(alianza => {
      alianza.votosTotales = votos.filter(voto => alianza.partidos.includes(voto.partido))
        .reduce((a,b) => a + b.votos, 0);
      alianza.nRepresentantes = mostVotes.filter(vote => alianza.nombre === vote.nombre).length;
      alianzasDict[alianza.nombre] = {
        "color": alianza.color,
        "votosTotales": alianza.votosTotales,
        "nRepresentantes": alianza.nRepresentantes,
        "nombres": alianza.nombres
      }
    });

    const circlesData = {
      "name": "All",
      "children": alianzasData.map(alianza => {
          return {
            "name": alianza.nombre,
            "children": alianza.partidos.map(partido => {
              return {
                "name": partido,
                "value": votos.filter(voto => voto.partido === partido).reduce((a,b) => a + b.votos, 0)
              }
            })
          }
      })
    };

    const pack = data =>
      d3.pack()
        .size([width - 2, height - 2])
        .padding(3)(
          d3
            .hierarchy(data)
            .sum(d => d.value)
        );

    const gScale = d3
      .scalePoint()
      .padding(0.5)
      .domain(d3.map(alianzasData.filter(alianza => alianza.partidos.length > 0), (d) => d.nombre))
      .range([20, width-20]);

    const root = pack(circlesData);

    const mainnodes = root.descendants().filter((d) => d.height == 1);

    const alianzasCircles = root.descendants().filter((d) => d.height == 1);

    const maxRadius = d3.max(alianzasCircles, d => d.r);

    const widthPadding = maxRadius * 0.6;

    const widthBand = d3.sum(mainnodes, (d) => d.r * 2 + widthPadding);

    const rScale = d3.scaleLinear().domain([0, widthBand]).range([0, width]);

    const svgHeight = Math.max(rScale(2 * maxRadius) * 1.5, height);
    const stdY = svgHeight / 2;

    const circlePadding = 50
    let cumPos = circlePadding;
    alianzasCircles.forEach(alianza => {
      alianza.posX = cumPos + rScale(alianza.r);
      cumPos += 2 * rScale(alianza.r) + circlePadding;
    });
    
    svg.attr('height', svgHeight).attr("viewBox", [0, 0, width, svgHeight]);

    const drag = d3.drag()
      .on("start", startDragging)
      .on("drag", dragCircle)
      .on("end", endDragging);

    function dragCircle(event, d) {
      const [x, y] = d3.pointer(event, svg.node());
      d3.select(this)
        .attr("transform", `translate(${x},${y})`);
      overCircle = overDragCircles(x, y);
      if (overCircle !== null) {
        outerNodes.filter(d => d.data.name === overCircle.data.name)
          .attr("stroke", d => alianzasDict[d.data.name].color)
          .attr("stroke-width", 3);
      } else {
        outerNodes.attr("stroke", "#BBB");
      }
    }
    
    function overDragCircles(x, y) {
      let thisCircle = null;
      alianzasCircles.forEach(circle => {
        if (Math.pow(x - circle.posX, 2) + Math.pow(y - stdY, 2) <= Math.pow(rScale(circle.r), 2)) {
          thisCircle = circle;
        }
      });
      return thisCircle;
    }
    
    function startDragging(event) {
      d3.select(this)
        .raise();
    }
    
    function endDragging(event, d) {
      if (overCircle === null) {
        d3.select(this)
          .transition(100)
          .attr("transform", d => `translate(${gScale(d.parent.data.name) + rScale(d.x - d.parent.x)},${stdY + rScale(d.y - d.parent.y)})`)
      } else {
        alianzas.forEach(alianza => {
          if (alianza.partidos.includes(d.data.name)) {
            let index = alianza.partidos.indexOf(d.data.name);
            alianza.partidos.splice(index, 1);
          }
        });
        alianzas.filter(alianza => alianza.nombre === overCircle.data.name)[0].partidos.push(d.data.name);
        updatePlot(alianzas);
      }
    }

    const outerNodes = svg
      .selectAll(".outer-circle")
      .data(alianzasCircles)
      .join("circle")
      .attr("class", "outer-circle")
      .attr("r", (d) => rScale(d.r))
      .attr("fill", (d) => "none")
      .attr("stroke", d => alianzasDict[d.data.name].color)
      .attr("opacity", 0.8)
      .attr("stroke-width", 2)
      .attr("cx", d => d.posX)
      .attr("cy", stdY);

    const groups = svg.selectAll(".partido")
      .data(alianzasCircles.map(d => d.children).sort((a,b) => b.r - a.r).flat())
      .join("g")
        .attr("class", "partido")
        .attr("transform", d => `translate(${d.parent.posX + rScale(d.x - d.parent.x)},${stdY + rScale(d.y - d.parent.y)})`)
        .call(drag);

    groups.selectAll(".inner-circle")
      .data(d => [d])
      .join("circle")
      .attr("class", "inner-circle")
      .attr("r", (d) => rScale(d.r))
      .attr("fill", (d) => partidosDict[d.data.name].colorFill)
      .attr("opacity", 0.5)
      .attr("stroke", d => partidosDict[d.data.name].colorStroke)
      .attr("stroke-width", 1.5)
      // .attr("cx", (d) => rScale(d.x - d.parent.x))
      // .attr("cy", (d) => rScale(d.y - d.parent.y))
      .attr("transform", `translate(0,0)`);

    const fontSize = 24;

    groups.selectAll(".inner-circle-label")
      .data(d =>[d])
      .join("text")
      .attr("class", "inner-circle-label")
      .attr("fill", (d) => partidosDict[d.data.name].colorStroke)
      .style("font-size", d => d3.min([fontSize, rScale(d.r)*2/3]))
      .style("font-weight", 700)
      .attr("dominant-baseline", "middle")
      // .attr("x", (d) => rScale(d.x - d.parent.x))
      // .attr("y", (d) => rScale(d.y - d.parent.y))
      .attr("transform", `translate(0,0)`)
      .text(d => partidosDict[d.data.name].nombreCorto);

    svg.selectAll(".labels").remove();

    const labels = svg
      .selectAll(".alianza-labels")
      .data(alianzasCircles)
      .join("g")
        .attr("class", "alianza-labels")
        .attr("fill", d => alianzasDict[d.data.name].color)
        .attr("transform", d => `translate(${d.posX},20)`)
    
    labels.selectAll("text")
      .data(d => [...alianzasDict[d.data.name].nombres, alianzasDict[d.data.name].nRepresentantes + " escaños", d3.format(".3s")(alianzasDict[d.data.name].votosTotales) + ' votos'])
      .join("text")
        .attr("dy", (d,i) => i * 16)
        .style("font-size", (d,i) => i <= 1 ? 16 : 14)
        .style("font-weight", d => d.includes('votos') ? 300 : d.includes('escaños') ? 400 : 500)
        .style("letter-spacing", "-0.5px")
        .text(d => d);

  }
  updatePlot(alianzas);

})
